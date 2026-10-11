using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
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
            Application.Run(new LauncherForm());
        }

        private static void CreateShortcuts()
        {
            if (!File.Exists(Page))
                throw new FileNotFoundException("Сначала установите файлы Недельника.", Page);
            Type type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) throw new InvalidOperationException("Windows Script Host недоступен.");
            object shell = Activator.CreateInstance(type);
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string startFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Недельник");
                Directory.CreateDirectory(startFolder);
                if (!string.IsNullOrEmpty(desktop) && Directory.Exists(desktop))
                    CreateShortcut(type, shell, Path.Combine(desktop, "Недельник.lnk"));
                CreateShortcut(type, shell, Path.Combine(startFolder, "Недельник.lnk"));
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
                SetShortcutProperty(shortcutType, shortcut, "Arguments", "");
                SetShortcutProperty(shortcutType, shortcut, "WorkingDirectory", Home);
                SetShortcutProperty(shortcutType, shortcut, "Description", "Недельник — планировщик на неделю");
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

        internal static bool PullUpdates()
        {
            if (!Directory.Exists(Path.Combine(Source, ".git"))) return false;
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = FindGit();
                info.Arguments = "-C \"" + Source + "\" pull --ff-only --quiet origin main";
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                info.EnvironmentVariables["GIT_TERMINAL_PROMPT"] = "0";
                using (Process process = Process.Start(info))
                {
                    if (process == null) return false;
                    if (!process.WaitForExit(25000))
                    {
                        process.Kill();
                        process.WaitForExit();
                        return false;
                    }
                    return process.ExitCode == 0;
                }
            }
            catch { return false; }
        }

        internal static void OpenPlanner()
        {
            if (!File.Exists(Page))
                throw new FileNotFoundException("Файлы планировщика не найдены. Запустите установщик ещё раз.", Page);
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

    internal sealed class LauncherForm : Form
    {
        private readonly Label status;
        private readonly Button update;
        private readonly Button open;
        private bool updating;

        internal LauncherForm()
        {
            Text = "Недельник";
            ClientSize = new Size(540, 320);
            BackColor = Color.FromArgb(248, 249, 254);
            Font = new Font("Segoe UI", 10, FontStyle.Regular);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = true;
            ShowInTaskbar = true;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { }

            Panel top = new Panel();
            top.Dock = DockStyle.Top;
            top.Height = 126;
            top.BackColor = Color.White;
            Controls.Add(top);

            PictureBox image = new PictureBox();
            image.Location = new Point(28, 25);
            image.Size = new Size(75, 75);
            image.SizeMode = PictureBoxSizeMode.Zoom;
            try
            {
                using (Icon logo = new Icon(Icon, new Size(64, 64)))
                    image.Image = logo.ToBitmap();
            }
            catch { }
            top.Controls.Add(image);

            Label title = MakeLabel("Недельник", 122, 27, 380, 40, 23, FontStyle.Bold,
                Color.FromArgb(34, 42, 69));
            top.Controls.Add(title);
            top.Controls.Add(MakeLabel("Планировщик дел на неделю", 124, 71, 360, 28, 11,
                FontStyle.Regular, Color.FromArgb(106, 116, 139)));

            open = MakeButton("Открыть планировщик", 31, 156, 478, 58,
                Color.FromArgb(91, 107, 224), Color.White);
            open.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            open.Click += OpenClicked;
            Controls.Add(open);
            AcceptButton = open;

            status = MakeLabel("Проверяем обновления...", 32, 238, 485, 24, 10,
                FontStyle.Regular, Color.FromArgb(89, 101, 126));
            Controls.Add(status);

            update = MakeButton("Проверить обновления", 31, 274, 219, 33,
                Color.FromArgb(232, 236, 248), Color.FromArgb(61, 75, 112));
            update.Font = new Font("Segoe UI", 9);
            update.Click += async (sender, args) => await CheckUpdatesAsync();
            Controls.Add(update);

            Button folder = MakeButton("Открыть папку", 267, 274, 242, 33,
                Color.FromArgb(232, 236, 248), Color.FromArgb(61, 75, 112));
            folder.Font = new Font("Segoe UI", 9);
            folder.Click += (sender, args) =>
            {
                try { Process.Start("explorer.exe", "\"" + Program.Home + "\""); }
                catch (Exception e) { MessageBox.Show(e.Message, "Недельник"); }
            };
            Controls.Add(folder);

            Shown += async (sender, args) => await CheckUpdatesAsync();
        }

        private static Label MakeLabel(string value, int x, int y, int w, int h,
            float size, FontStyle style, Color foreground)
        {
            Label label = new Label();
            label.Text = value;
            label.Location = new Point(x, y);
            label.Size = new Size(w, h);
            label.Font = new Font("Segoe UI", size, style);
            label.ForeColor = foreground;
            label.TextAlign = ContentAlignment.MiddleLeft;
            return label;
        }

        private static Button MakeButton(string text, int x, int y, int w, int h,
            Color background, Color foreground)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = new Point(x, y);
            b.Size = new Size(w, h);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = background;
            b.ForeColor = foreground;
            b.Cursor = Cursors.Hand;
            return b;
        }

        private async Task CheckUpdatesAsync()
        {
            if (updating) return;
            updating = true;
            update.Enabled = false;
            status.Text = "Проверяем обновления на GitHub...";
            bool succeeded = await Task.Run(() => Program.PullUpdates());
            status.Text = succeeded ? "Недельник готов. Обновления проверены."
                : "Недельник готов. Можно работать без интернета.";
            update.Enabled = true;
            updating = false;
        }

        private void OpenClicked(object sender, EventArgs args)
        {
            try
            {
                Program.OpenPlanner();
                Close();
            }
            catch (Exception e)
            {
                MessageBox.Show(e.Message, "Недельник", MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }
}
