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
        private readonly Label updateWarning;

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

            updateWarning = new Label();
            updateWarning.Text = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f. \u041e\u0442\u043a\u0440\u044b\u0442\u0430 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u0430\u044f \u0432\u0435\u0440\u0441\u0438\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435 \u0438\u043b\u0438 \u043f\u0435\u0440\u0435\u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0435 \u043b\u0430\u0443\u043d\u0447\u0435\u0440.";
            updateWarning.Dock = DockStyle.Top;
            updateWarning.Height = 34;
            updateWarning.TextAlign = ContentAlignment.MiddleCenter;
            updateWarning.Font = new Font("Segoe UI", 9);
            updateWarning.BackColor = Color.FromArgb(80, 56, 39);
            updateWarning.ForeColor = Color.FromArgb(249, 225, 194);
            updateWarning.Visible = false;
            Controls.Add(updateWarning);

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

        private async Task LoadPlannerAsync()
        {
            try
            {
                message.Text = "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u0435\u0440\u0435\u0434 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u0435\u043c...";
                // This also runs when a shortcut points directly to --planner and bypasses
                // the start screen, so an outdated planner is never opened silently.
                bool updated = await Task.Run(() => Program.PullUpdates());
                if (IsDisposed) return;
                updateWarning.Visible = !updated;
                updateWarning.BringToFront();
                if (!File.Exists(Program.Page))
                    throw new FileNotFoundException("\u0424\u0430\u0439\u043b \u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0449\u0438\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.", Program.Page);

                // Keep the old Edge/Chrome user profile intact.
                // This separate WebView2 profile holds plans for the native Windows window.
                string profile = Path.Combine(Program.Home, "webview-profile");
                Directory.CreateDirectory(profile);
                CoreWebView2Environment environment =
                    await CoreWebView2Environment.CreateAsync(null, profile);
                await browser.EnsureCoreWebView2Async(environment);
                if (IsDisposed) return;
                browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
                // File:// resources can be cached across app restarts by WebView2.
                // Disable network cache while keeping localStorage and user data intact.
                try
                {
                    await browser.CoreWebView2.CallDevToolsProtocolMethodAsync("Network.enable", "{}");
                    await browser.CoreWebView2.CallDevToolsProtocolMethodAsync(
                        "Network.setCacheDisabled", "{\"cacheDisabled\":true}");
                }
                catch { /* Loading the offline planner does not depend on DevTools. */ }
                browser.CoreWebView2.Navigate(new Uri(Program.Page).AbsoluteUri);
                browser.Visible = true;
                browser.BringToFront();
                if (!updated) updateWarning.BringToFront();
            }
            catch (Exception error)
            {
                message.Text =
                    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u043e\u0435 \u043e\u043a\u043d\u043e.\n" +
                    "\u041d\u0443\u0436\u0435\u043d Microsoft Edge WebView2 Runtime.\n\n" +
                    error.Message;
                message.Height = 220;
                openOldTasks.Top = 235;
                openOldTasks.Visible = true;
            }
        }
    }
}
