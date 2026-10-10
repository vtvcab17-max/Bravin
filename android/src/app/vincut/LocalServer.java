package app.vincut;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.BufferedInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Tiny HTTP server on 127.0.0.1 that serves the app (assets/www) and the user's picked phone files (/u/<name>),
 *  with byte-range support so <video> can seek. Same job as serve.ps1 in the Windows version. */
public class LocalServer {
    static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    final MainActivity act;
    final AssetManager am;
    ServerSocket ss;
    final ExecutorService pool = Executors.newCachedThreadPool();
    volatile boolean running;

    LocalServer(MainActivity a) { act = a; am = a.getAssets(); }

    /** Fixed port first so localStorage (AI settings, autosave) survives restarts. */
    int start() throws Exception {
        Exception last = null;
        for (int p = 47865; p <= 47885; p++) {
            try { ss = new ServerSocket(p, 64, InetAddress.getByName("127.0.0.1")); break; } catch (Exception e) { last = e; }
        }
        if (ss == null) throw last;
        running = true;
        Thread t = new Thread(new Runnable() {
            public void run() {
                while (running) {
                    try { final Socket s = ss.accept(); pool.execute(new Runnable() { public void run() { handle(s); } }); }
                    catch (Exception e) { if (!running) return; }
                }
            }
        }, "vincut-http");
        t.setDaemon(true);
        t.start();
        return ss.getLocalPort();
    }

    void stop() { running = false; try { ss.close(); } catch (Exception ignored) { } pool.shutdownNow(); }

    static String readLine(InputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) { if (c == '\n') break; if (c != '\r') sb.append((char) c); if (sb.length() > 8192) break; }
        return c == -1 && sb.length() == 0 ? null : sb.toString();
    }

    void handle(Socket s) {
        InputStream src = null;
        try {
            s.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String req = readLine(in);
            if (req == null) return;
            String range = null, line;
            boolean bravin = false;
            while ((line = readLine(in)) != null && line.length() > 0) {
                int k = line.indexOf(':');
                if (k > 0 && line.substring(0, k).trim().equalsIgnoreCase("range")) range = line.substring(k + 1).trim();
                if (k > 0 && line.substring(0, k).trim().equalsIgnoreCase("x-bravin")) bravin = true;
            }
            String[] parts = req.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];
            int q = path.indexOf('?');
            String rawq = q >= 0 ? path.substring(q + 1) : "";
            if (q >= 0) path = path.substring(0, q);
            if (path.equals("/dl")) { download(out, rawq, bravin); return; }
            path = URLDecoder.decode(path.replace("+", "%2B"), "UTF-8");
            if (path.equals("/")) path = "/index.html";

            long len;
            String type = mime(path);
            if (path.startsWith("/tts/")) {
                java.io.File f = new java.io.File(new java.io.File(act.getCacheDir(), "tts"), path.substring(5).replace("/", ""));
                if (!f.isFile()) { status(out, 404, "Not Found"); return; }
                len = f.length(); src = new java.io.FileInputStream(f); type = "audio/wav";
            } else if (path.startsWith("/u/")) {
                Uri u = act.userUri(path.substring(3));
                if (u == null) { status(out, 404, "Not Found"); return; }
                ParcelFileDescriptor pfd = act.getContentResolver().openFileDescriptor(u, "r");
                if (pfd == null) { status(out, 404, "Not Found"); return; }
                len = pfd.getStatSize();
                src = new ParcelFileDescriptor.AutoCloseInputStream(pfd);
                String t2 = act.getContentResolver().getType(u);
                if (t2 != null && type.equals("application/octet-stream")) type = t2;
            } else {
                if (path.contains("..")) { status(out, 403, "Forbidden"); return; }
                String asset = "www" + path;
                try {
                    AssetFileDescriptor afd = am.openFd(asset); // works because the APK stores assets uncompressed
                    len = afd.getLength();
                    src = afd.createInputStream();
                } catch (Exception notUncompressed) {
                    try { src = am.open(asset, AssetManager.ACCESS_STREAMING); } catch (Exception e) { status(out, 404, "Not Found"); return; }
                    len = src.available();
                }
            }

            long start = 0, end = len - 1;
            boolean partial = false;
            if (range != null && len > 0) {
                Matcher m = RANGE.matcher(range);
                if (m.find()) {
                    String a = m.group(1), b = m.group(2);
                    if (a.length() > 0) { start = Long.parseLong(a); if (b.length() > 0) end = Long.parseLong(b); }
                    else if (b.length() > 0) start = Math.max(0, len - Long.parseLong(b));
                    if (end >= len) end = len - 1;
                    if (start > end) {
                        out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + len + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
                        out.flush();
                        return;
                    }
                    partial = true;
                }
            }
            long count = len < 0 ? -1 : end - start + 1;
            StringBuilder h = new StringBuilder();
            h.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
            h.append("Content-Type: ").append(type).append("\r\n");
            if (count >= 0) h.append("Content-Length: ").append(count).append("\r\n");
            if (partial) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(len).append("\r\n");
            h.append("Accept-Ranges: bytes\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n");
            out.write(h.toString().getBytes("ISO-8859-1"));
            if (!method.equals("HEAD")) {
                if (start > 0) skipFully(src, start);
                byte[] buf = new byte[1 << 16];
                long left = count < 0 ? Long.MAX_VALUE : count;
                while (left > 0) {
                    int n = src.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n <= 0) break;
                    out.write(buf, 0, n);
                    left -= n;
                }
            }
            out.flush();
        } catch (Exception ignored) {
            // client went away (normal when <video> seeks)
        } finally {
            try { if (src != null) src.close(); } catch (Exception ignored) { }
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    /** /dl?url=... : tải hộ một link http(s) (WebView bị CORS chặn nhiều trang). Chỉ nhận yêu cầu có header X-Bravin. */
    void download(OutputStream out, String rawq, boolean bravin) throws Exception {
        if (!bravin) { status(out, 403, "Forbidden"); return; }
        String target = null;
        for (String kv : rawq.split("&")) { if (kv.startsWith("url=")) target = URLDecoder.decode(kv.substring(4).replace("+", "%2B"), "UTF-8"); }
        if (target == null || !(target.startsWith("http://") || target.startsWith("https://"))) { status(out, 400, "Bad Request"); return; }
        java.net.HttpURLConnection c = null;
        InputStream in = null;
        try {
            for (int hop = 0; hop < 6; hop++) {
                c = (java.net.HttpURLConnection) new java.net.URL(target).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
                c.setRequestProperty("Accept", "*/*");
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    target = new java.net.URL(new java.net.URL(target), c.getHeaderField("Location")).toString();
                    c.disconnect(); continue;
                }
                break;
            }
            int code = c.getResponseCode();
            if (code >= 400) { out.write(("HTTP/1.1 502 Bad Gateway\r\nX-Dl-Status: " + code + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1")); out.flush(); return; }
            in = c.getInputStream();
            long len = -1; try { String cl = c.getHeaderField("Content-Length"); if (cl != null) len = Long.parseLong(cl.trim()); } catch (Exception ignored) { }
            String ct = c.getContentType(); if (ct == null) ct = "application/octet-stream";
            String cd = c.getHeaderField("Content-Disposition");
            StringBuilder h = new StringBuilder("HTTP/1.1 200 OK\r\n");
            h.append("Content-Type: ").append(ct.replace("\r", "").replace("\n", "")).append("\r\n");
            if (len >= 0) h.append("Content-Length: ").append(len).append("\r\n");
            if (cd != null) h.append("X-Dl-Disposition: ").append(java.net.URLEncoder.encode(cd, "UTF-8")).append("\r\n");
            h.append("X-Dl-Url: ").append(java.net.URLEncoder.encode(target, "UTF-8")).append("\r\n");
            h.append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
            out.write(h.toString().getBytes("ISO-8859-1"));
            byte[] buf = new byte[1 << 16]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.flush();
        } catch (java.net.UnknownHostException | java.net.ConnectException | java.net.SocketTimeoutException e) {
            out.write(("HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1")); out.flush();
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
            if (c != null) c.disconnect();
        }
    }

    static void skipFully(InputStream in, long n) throws Exception {
        // FileInputStream.skip (assets and phone files) is an lseek, so this is fast
        while (n > 0) { long k = in.skip(n); if (k <= 0) { if (in.read() < 0) return; k = 1; } n -= k; }
    }

    static void status(OutputStream out, int code, String msg) throws Exception {
        out.write(("HTTP/1.1 " + code + " " + msg + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes("ISO-8859-1"));
        out.flush();
    }

    static String mime(String p) {
        String e = p.substring(p.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (e) {
            case "html": return "text/html; charset=utf-8";
            case "js": return "text/javascript; charset=utf-8";
            case "css": return "text/css; charset=utf-8";
            case "json": return "application/json; charset=utf-8";
            case "mp4": case "m4v": return "video/mp4";
            case "mov": return "video/quicktime";
            case "webm": return "video/webm";
            case "mp3": return "audio/mpeg";
            case "m4a": case "aac": return "audio/mp4";
            case "wav": return "audio/wav";
            case "ogg": return "audio/ogg";
            case "jpg": case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "ttf": return "font/ttf";
            case "woff2": return "font/woff2";
            case "svg": return "image/svg+xml";
            case "txt": case "md": return "text/plain; charset=utf-8";
            default: return "application/octet-stream";
        }
    }
}
