package app.vincut;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.io.RandomAccessFile;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static final int REQ_FILE = 11, REQ_MIC = 12, REQ_STORAGE = 13;
    WebView web;
    LocalServer server;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;
    SharedPreferences prefs;
    int backTries = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("vincut", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#131417"));
        getWindow().setNavigationBarColor(Color.parseColor("#131417"));

        server = new LocalServer(this);
        int port;
        try { port = server.start(); } catch (Exception e) { Toast.makeText(this, "Không mở được máy chủ nội bộ: " + e, Toast.LENGTH_LONG).show(); finish(); return; }

        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#131417"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " VINCutAndroid/1.0");
        web.addJavascriptInterface(new Bridge(), "VINCutAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri u = Uri.parse(url);
                if ("127.0.0.1".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                ArrayList<String> mimes = new ArrayList<String>();
                boolean any = false;
                for (String a : p.getAcceptTypes()) {
                    if (a == null) continue;
                    for (String part : a.split(",")) {
                        String m = part.trim();
                        if (m.length() == 0) continue;
                        if (m.startsWith(".")) { any = true; continue; } // .json etc: phones label these inconsistently
                        mimes.add(m);
                    }
                }
                if (!any && !mimes.isEmpty() && !mimes.contains("*/*")) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(i, REQ_FILE); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest r) {
                boolean audio = false;
                for (String res : r.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) audio = true;
                if (!audio) { r.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingPerm = r;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage m) { return super.onConsoleMessage(m); }
        });

        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);

        web.loadUrl("http://127.0.0.1:" + port + "/index.html");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.vincutAutosave&&vincutAutosave()", null);
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        // close an open dialog / menu first (same as pressing Esc)
        web.evaluateJavascript("(function(){try{return window.vincutBack?vincutBack():0}catch(e){return 0}})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String r) {
                if ("1".equals(r)) return;
                web.evaluateJavascript("window.vincutAutosave&&vincutAutosave()", null);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Thoát Bravin?")
                        .setMessage("Dự án đã được lưu tự động trên máy. Lần sau mở app, dự án nằm ở màn hình Dự án.")
                        .setPositiveButton("Thoát", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) { finish(); } })
                        .setNegativeButton("Ở lại", null)
                        .show();
            }
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE || fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            ArrayList<Uri> list = new ArrayList<Uri>();
            ClipData cd = data.getClipData();
            if (cd != null) for (int k = 0; k < cd.getItemCount(); k++) list.add(cd.getItemAt(k).getUri());
            else if (data.getData() != null) list.add(data.getData());
            SharedPreferences.Editor ed = prefs.edit();
            for (Uri u : list) {
                try { getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { }
                String name = displayName(u);
                if (name != null) ed.putString("u:" + name, u.toString());
            }
            ed.apply();
            out = list.toArray(new Uri[0]);
        }
        fileCb.onReceiveValue(out);
        fileCb = null;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req == REQ_MIC && pendingPerm != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    String displayName(Uri u) {
        Cursor c = null;
        try {
            c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        } finally { if (c != null) c.close(); }
        return u.getLastPathSegment();
    }

    Uri userUri(String name) {
        String s = prefs.getString("u:" + name, null);
        return s == null ? null : Uri.parse(s);
    }

    /** Show messages with the page's own toast (same look as the rest of the app); native toast only if the page is not ready. */
    void toast(final String msg) {
        runOnUiThread(new Runnable() { public void run() {
            if (web != null) web.evaluateJavascript("(function(m){if(window.toast){toast(m);return 1}return 0})(" + org.json.JSONObject.quote(msg) + ")", new ValueCallback<String>() {
                public void onReceiveValue(String r) { if (!"1".equals(r)) Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); } });
            else Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
        } });
    }

    /** Called from the page as window.VINCutAndroid */
    class Bridge {
        final Map<String, Object[]> jobs = new HashMap<String, Object[]>(); // id -> {name, mime, File, FileOutputStream}
        int seq = 0;

        @JavascriptInterface
        public String version() { return "1.0"; }

        @JavascriptInterface
        public synchronized String begin(String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "out");
                dir.mkdirs();
                String id = "j" + (++seq) + "_" + System.currentTimeMillis();
                File f = new File(dir, id);
                jobs.put(id, new Object[]{safeName(name), mime, f, new FileOutputStream(f)});
                return id;
            } catch (Exception e) { return ""; }
        }

        /** Random-access output (MP4 muxer writes its header at the end). */
        @JavascriptInterface
        public synchronized String beginRandom(String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "out"); dir.mkdirs();
                String id = "r" + (++seq) + "_" + System.currentTimeMillis();
                File f = new File(dir, id);
                jobs.put(id, new Object[]{safeName(name), mime, f, new RandomAccessFile(f, "rw")});
                return id;
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean writeAt(String id, double pos, String b64) {
            Object[] j = jobs.get(id);
            if (j == null || !(j[3] instanceof RandomAccessFile)) return false;
            try { RandomAccessFile raf = (RandomAccessFile) j[3]; raf.seek((long) pos); raf.write(Base64.decode(b64, Base64.NO_WRAP)); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean append(String id, String b64) {
            Object[] j = jobs.get(id);
            if (j == null) return false;
            try { ((FileOutputStream) j[3]).write(Base64.decode(b64, Base64.NO_WRAP)); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String finish(String id) {
            boolean abort = id.endsWith(":abort"); if (abort) id = id.substring(0, id.length() - 6);
            Object[] j = jobs.remove(id);
            if (j == null) return "";
            String name = (String) j[0], mime = (String) j[1];
            File tmp = (File) j[2];
            try {
                if (j[3] instanceof RandomAccessFile) ((RandomAccessFile) j[3]).close(); else ((FileOutputStream) j[3]).close();
                if (abort) { tmp.delete(); return ""; }
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put("_display_name", name);
                    cv.put("mime_type", mime == null || mime.length() == 0 ? "application/octet-stream" : mime);
                    cv.put("relative_path", Environment.DIRECTORY_DOWNLOADS + "/Bravin");
                    Uri dest = getContentResolver().insert(Uri.parse("content://media/external/downloads"), cv);
                    if (dest == null) throw new Exception("insert");
                    OutputStream os = getContentResolver().openOutputStream(dest);
                    copy(new FileInputStream(tmp), os);
                    where = "Download/Bravin/" + name;
                } else {
                    File dir;
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED)
                        dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Bravin");
                    else dir = new File(getExternalFilesDir(null), "Bravin");
                    dir.mkdirs();
                    File dest = new File(dir, name);
                    copy(new FileInputStream(tmp), new FileOutputStream(dest));
                    where = dest.getAbsolutePath();
                }
                tmp.delete();
                toast("Đã lưu: " + where);
                return where;
            } catch (Exception e) {
                tmp.delete();
                toast("Không lưu được file: " + e.getMessage());
                return "";
            }
        }

        /** Text to speech with the phone's voices → served at /tts/<file>.wav */
        @JavascriptInterface
        public String tts(String text, String lang, double rate) {
            try {
                final CountDownLatch ready = new CountDownLatch(1); final int[] st = {-1};
                final TextToSpeech[] holder = new TextToSpeech[1];
                runOnUiThread(new Runnable() { public void run() { holder[0] = new TextToSpeech(MainActivity.this, new TextToSpeech.OnInitListener() { public void onInit(int s2) { st[0] = s2; ready.countDown(); } }); } });
                if (!ready.await(15, TimeUnit.SECONDS) || st[0] != TextToSpeech.SUCCESS) return "";
                TextToSpeech tts = holder[0];
                Locale loc = Locale.forLanguageTag(lang == null || lang.length() == 0 ? "vi-VN" : lang);
                int av = tts.setLanguage(loc);
                if (av == TextToSpeech.LANG_MISSING_DATA || av == TextToSpeech.LANG_NOT_SUPPORTED) { toast("Máy chưa có giọng đọc " + loc.getDisplayLanguage() + ". Cài trong Cài đặt > Chuyển văn bản thành giọng nói."); tts.shutdown(); return ""; }
                tts.setSpeechRate((float) rate);
                File dir = new File(getCacheDir(), "tts"); dir.mkdirs();
                final String fname = "t" + System.currentTimeMillis() + ".wav"; File out = new File(dir, fname);
                final CountDownLatch done = new CountDownLatch(1);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    public void onStart(String u) { }
                    public void onDone(String u) { done.countDown(); }
                    public void onError(String u) { done.countDown(); }
                });
                Bundle params = new Bundle();
                tts.synthesizeToFile(text, params, out, "vincut");
                done.await(120, TimeUnit.SECONDS); tts.shutdown();
                return out.exists() && out.length() > 44 ? "/tts/" + fname : "";
            } catch (Exception e) { return ""; }
        }

        /** URL the page can use to reopen a phone file next time (served by LocalServer), or "" */
        @JavascriptInterface
        public String persistUrl(String name) {
            if (userUri(name) == null) return "";
            try { return "/u/" + URLEncoder.encode(name, "UTF-8").replace("+", "%20"); } catch (Exception e) { return ""; }
        }
    }

    static String safeName(String n) {
        if (n == null || n.length() == 0) n = "vincut";
        return n.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[1 << 16];
        int n;
        try { while ((n = in.read(buf)) > 0) out.write(buf, 0, n); } finally { in.close(); out.close(); }
    }
}
