using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Threading;
using System.Windows.Forms;

namespace NedelnikLauncher
{
    internal static class Program
    {
        internal static readonly string Home = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nedelnik");
        internal static readonly string Source = Path.Combine(Home, "source");
        internal static readonly string Page = Path.Combine(Source, "weekly-planner", "planner-standalone.html");
        internal static readonly string Profile = Path.Combine(Home, "browser-profile");

        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute,
            ref int value, int size);

        internal static void ApplyDarkTitleBar(Form form)
        {
            // DWM attribute 20: dark caption on modern Windows; fallback 19.
            try
            {
                int enabled = 1;
                int result = DwmSetWindowAttribute(form.Handle, 20, ref enabled, sizeof(int));
                if (result != 0)
                    DwmSetWindowAttribute(form.Handle, 19, ref enabled, sizeof(int));
            }
            catch { /* Older Windows versions retain their normal caption. */ }
        }

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--self-test")
            {
                try
                {
                    using (Icon icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath))
                    {
                        Environment.ExitCode = icon == null ? 2 : 0;
                    }
                }
                catch { Environment.ExitCode = 2; }
                return;
            }
            if (args.Length > 0 && args[0] == "--planner")
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new PlannerWindow());
                return;
            }
            if (args.Length > 0 && args[0] == "--webview-check")
            {
                try
                {
                    string lib = typeof(Microsoft.Web.WebView2.WinForms.WebView2).Assembly.GetName().Name;
                    string core = typeof(Microsoft.Web.WebView2.Core.CoreWebView2Environment).Assembly.GetName().Name;
                    string loader = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "WebView2Loader.dll");
                    Environment.ExitCode = lib.Length > 0 && core.Length > 0 && File.Exists(loader) ? 0 : 2;
                }
                catch { Environment.ExitCode = 2; }
                return;
            }
            if (args.Length > 0 && args[0] == "--install")
            {
                try { CreateShortcuts(); Environment.ExitCode = 0; }
                catch (Exception e)
                {
                    try
                    {
                        Directory.CreateDirectory(Home);
                        File.WriteAllText(Path.Combine(Home, "shortcut-install-error.log"), e.ToString());
                    }
                    catch { }
                    Environment.ExitCode = 1;
                }
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            // Open the actual planner, without the intermediary launcher form.
            Application.Run(new PlannerWindow());
        }

        private static void CreateShortcuts()
        {
            if (!File.Exists(Page))
                throw new FileNotFoundException("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0435 \u0444\u0430\u0439\u043b\u044b \u041d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a\u0430.", Page);
            Type type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) throw new InvalidOperationException("Windows Script Host \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d.");
            object shell = Activator.CreateInstance(type);
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string startFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Nedelnik");
                Directory.CreateDirectory(startFolder);
                if (!string.IsNullOrEmpty(desktop) && Directory.Exists(desktop))
                    CreateShortcut(type, shell, Path.Combine(desktop, "Nedelnik.lnk"));
                CreateShortcut(type, shell, Path.Combine(startFolder, "Nedelnik.lnk"));
            }
            finally
            {
                if (Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            }
        }

        private static void CreateShortcut(Type shellType, object shell, string path)
        {
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod,
                null, shell, new object[] { path });
            try
            {
                Type shortcutType = shortcut.GetType();
                SetShortcutProperty(shortcutType, shortcut, "TargetPath", Application.ExecutablePath);
                // --planner also bypasses the splash window with older installed EXEs.
                SetShortcutProperty(shortcutType, shortcut, "Arguments", "--planner");
                SetShortcutProperty(shortcutType, shortcut, "WorkingDirectory", Home);
                SetShortcutProperty(shortcutType, shortcut, "Description", "\u041d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a \u2014 \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0449\u0438\u043a \u043d\u0430 \u043d\u0435\u0434\u0435\u043b\u044e");
                SetShortcutProperty(shortcutType, shortcut, "IconLocation", Application.ExecutablePath + ",0");
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
            }
        }

        private static void SetShortcutProperty(Type type, object obj, string name, string value)
        {
            type.InvokeMember(name, BindingFlags.SetProperty, null, obj, new object[] { value });
        }

        internal static string FindGit()
        {
            string[] paths = {
                "git.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Git", "cmd", "git.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Git", "cmd", "git.exe")
            };
            foreach (string path in paths)
            {
                if (path == "git.exe" || File.Exists(path)) return path;
            }
            return "git.exe";
        }

        private static void WriteUpdateLog(string message)
        {
            try
            {
                Directory.CreateDirectory(Home);
                File.WriteAllText(Path.Combine(Home, "update-status.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + Environment.NewLine + message);
            }
            catch { }
        }

        internal static string InstalledVersion()
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = FindGit();
                info.Arguments = "-C \"" + Source + "\" rev-parse --short=8 HEAD";
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                using (Process process = Process.Start(info))
                {
                    if (process == null || !process.WaitForExit(4000)) return "?";
                    string sha = process.StandardOutput.ReadToEnd().Trim();
                    return process.ExitCode == 0 && sha.Length == 8 ? sha : "?";
                }
            }
            catch { return "?"; }
        }

        internal static bool PullUpdates()
        {
            if (!Directory.Exists(Path.Combine(Source, ".git")))
            {
                WriteUpdateLog("Source repository is missing.");
                return false;
            }
            // Both the launcher and a direct --planner shortcut may check Git;
            // serialize them to avoid overlapping Git index.lock operations.
            using (Mutex mutex = new Mutex(false, "Local\\NedelnikGitUpdate"))
            {
                bool locked = false;
                try
                {
                    try { locked = mutex.WaitOne(30000); }
                    catch (AbandonedMutexException) { locked = true; }
                    if (!locked)
                    {
                        WriteUpdateLog("Another update is still running.");
                        return false;
                    }
                    ProcessStartInfo info = new ProcessStartInfo();
                    info.FileName = FindGit();
                    info.Arguments = "-C \"" + Source + "\" pull --ff-only --quiet origin main";
                    info.UseShellExecute = false;
                    info.CreateNoWindow = true;
                    info.WindowStyle = ProcessWindowStyle.Hidden;
                    info.RedirectStandardError = true;
                    info.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0";
                    using (Process process = Process.Start(info))
                    {
                        if (process == null)
                        {
                            WriteUpdateLog("Could not start Git.");
                            return false;
                        }
                        if (!process.WaitForExit(25000))
                        {
                            process.Kill();
                            process.WaitForExit();
                            WriteUpdateLog("Git update timed out after 25 seconds.");
                            return false;
                        }
                        string error = process.StandardError.ReadToEnd();
                        if (process.ExitCode != 0)
                        {
                            WriteUpdateLog("Git pull failed. Exit: " + process.ExitCode
                                + Environment.NewLine + error);
                            return false;
                        }
                        WriteUpdateLog("OK; updated to " + InstalledVersion());
                        return true;
                    }
                }
                catch (Exception error)
                {
                    WriteUpdateLog(error.ToString());
                    return false;
                }
                finally
                {
                    if (locked) mutex.ReleaseMutex();
                }
            }
        }

        internal static void OpenPlanner()
        {
            if (!File.Exists(Page))
                throw new FileNotFoundException("Planner HTML file is missing.", Page);
            Process.Start(new ProcessStartInfo(Application.ExecutablePath, "--planner")
            {
                UseShellExecute = false,
                WorkingDirectory = Home
            });
        }

        internal static void OpenPlannerLegacy()
        {
            if (!File.Exists(Page))
                throw new FileNotFoundException("\u0424\u0430\u0439\u043b\u044b \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0449\u0438\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b. \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0449\u0438\u043a \u0435\u0449\u0451 \u0440\u0430\u0437.", Page);
            Directory.CreateDirectory(Profile);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string program = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string[] browsers = {
                Path.Combine(programX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(program, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(local, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(program, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe")
            };
            string browser = null;
            foreach (string candidate in browsers)
            {
                if (File.Exists(candidate)) { browser = candidate; break; }
            }
            if (browser == null)
            {
                Process.Start(new ProcessStartInfo(Page) { UseShellExecute = true });
                return;
            }
            string uri = new Uri(Page).AbsoluteUri;
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = browser;
            start.Arguments = "--app=\"" + uri + "\" --user-data-dir=\"" + Profile + "\" --no-first-run";
            start.UseShellExecute = false;
            Process.Start(start);
        }
    }

}
