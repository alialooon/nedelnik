using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NedelnikLauncher
{
    // The weekly planner is hosted in a native Windows window.
    // Windows therefore displays our own EXE icon in the taskbar, not the Edge globe.
    internal sealed class PlannerWindow : Form
    {
        private readonly WebView2 browser;
        private readonly Label message;
        private readonly Button openOldTasks;
        private bool checkingUpdates;
        private bool startupUpdateStarted;
        private string updateState = "checking";
        private string updateVersion = "?";

        internal PlannerWindow()
        {
            Text = "\u0417\u0430\u0434\u0430\u0447\u0438 \u043d\u0430 \u043d\u0435\u0434\u0435\u043b\u044e";
            Width = 1220;
            Height = 820;
            MinimumSize = new Size(750, 560);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(16, 18, 20);
            ShowInTaskbar = true;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { }

            browser = new WebView2();
            browser.Dock = DockStyle.Fill;
            browser.Visible = false;
            Controls.Add(browser);

            Panel notice = new Panel();
            notice.Dock = DockStyle.Fill;
            notice.BackColor = Color.FromArgb(25, 28, 31);
            Controls.Add(notice);

            message = new Label();
            message.Text = "\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0449\u0438\u043a...";
            message.Dock = DockStyle.Top;
            message.Height = 112;
            message.Padding = new Padding(30, 38, 30, 0);
            message.Font = new Font("Segoe UI", 13);
            message.ForeColor = Color.FromArgb(211, 219, 223);
            notice.Controls.Add(message);

            openOldTasks = new Button();
            openOldTasks.Text = "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435";
            openOldTasks.Font = new Font("Segoe UI", 10);
            openOldTasks.Size = new Size(380, 45);
            openOldTasks.Location = new Point(32, 130);
            openOldTasks.Visible = false;
            openOldTasks.BackColor = Color.FromArgb(44, 49, 54);
            openOldTasks.ForeColor = Color.FromArgb(222, 228, 232);
            openOldTasks.FlatStyle = FlatStyle.Flat;
            openOldTasks.FlatAppearance.BorderColor = Color.FromArgb(71, 80, 87);
            openOldTasks.Click += (sender, args) =>
            {
                try { Program.OpenPlannerLegacy(); }
                catch (Exception error) { MessageBox.Show(error.Message, "\u041d\u0435\u0434\u0435\u043b\u044c\u043d\u0438\u043a"); }
            };
            notice.Controls.Add(openOldTasks);

            Shown += async (sender, args) => { Program.ApplyDarkTitleBar(this); await LoadPlannerAsync(); };
        }

        private void SendUpdateState()
        {
            try
            {
                if (!IsDisposed && browser.CoreWebView2 != null)
                    browser.CoreWebView2.PostWebMessageAsString(
                        "nedelnik:update:" + updateState + ":" + updateVersion);
            }
            catch { /* Web view is still loading. NavigationCompleted sends the state. */ }
        }

        private void OnPlannerMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            try
            {
                // Only the installed planner may request a Git operation.
                string expected = new Uri(Program.Page).AbsoluteUri;
                if (!string.Equals(args.Source, expected, StringComparison.OrdinalIgnoreCase))
                    return;
                if (args.TryGetWebMessageAsString() == "nedelnik:check-updates")
                    CheckUpdatesAsync();
            }
            catch { /* Ignore malformed or unrelated messages. */ }
        }

        private async Task CheckUpdatesAsync()
        {
            if (checkingUpdates)
            {
                SendUpdateState();
                return;
            }
            checkingUpdates = true;
            updateState = "checking";
            updateVersion = Program.InstalledVersion();
            SendUpdateState();
            string oldVersion = updateVersion;

            try
            {
                bool succeeded = await Task.Run(() => Program.PullUpdates());
                if (IsDisposed) return;
                string newVersion = Program.InstalledVersion();
                updateVersion = newVersion;
                if (!succeeded)
                    updateState = "failed";
                else
                    updateState = oldVersion == newVersion ? "current" : "updated";
                SendUpdateState();

                if (succeeded && oldVersion != newVersion && browser.CoreWebView2 != null)
                {
                    // Reload only the trusted offline page. WebView2 keeps its existing
                    // profile and localStorage, so user tasks are not deleted.
                    browser.CoreWebView2.Reload();
                }
            }
            catch
            {
                if (!IsDisposed)
                {
                    updateState = "failed";
                    SendUpdateState();
                }
            }
            finally { checkingUpdates = false; }
        }

        private async Task LoadPlannerAsync()
        {
            try
            {
                if (!File.Exists(Program.Page))
                    throw new FileNotFoundException("Planner files are missing. Please run the installer again.", Program.Page);
                message.Text = "Opening planner...";

                // Reuse the exact same WebView2 profile and localStorage as before.
                string profile = Path.Combine(Program.Home, "webview-profile");
                Directory.CreateDirectory(profile);
                CoreWebView2Environment environment =
                    await CoreWebView2Environment.CreateAsync(null, profile);
                if (IsDisposed) return;
                await browser.EnsureCoreWebView2Async(environment);
                if (IsDisposed) return;

                browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
                browser.CoreWebView2.WebMessageReceived += OnPlannerMessage;
                browser.CoreWebView2.NavigationCompleted += (sender, args) =>
                {
                    if (!args.IsSuccess || IsDisposed) return;
                    SendUpdateState();
                    if (!startupUpdateStarted)
                    {
                        startupUpdateStarted = true;
                        // Show the locally installed planner immediately, then update it.
                        CheckUpdatesAsync();
                    }
                };

                try
                {
                    await browser.CoreWebView2.CallDevToolsProtocolMethodAsync("Network.enable", "{}");
                    await browser.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Network.setCacheDisabled", "{\"cacheDisabled\":true}");
                }
                catch { /* Opening the local app does not depend on DevTools. */ }

                browser.CoreWebView2.Navigate(new Uri(Program.Page).AbsoluteUri);
                browser.Visible = true;
                browser.BringToFront();
            }
            catch (Exception error)
            {
                message.Text = "Could not open the planner. Microsoft Edge WebView2 Runtime may be missing.\n\n"
                    + error.Message;
                message.Height = 220;
                openOldTasks.Top = 235;
                openOldTasks.Visible = true;
            }
        }
    }
}
