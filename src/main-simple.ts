/**
 * Basic Main Electron process - simplified for initial functionality
 * Handles window management and basic IPC communication
 */

import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import * as path from "path";
import { config } from "./config";
import { Logger } from "./utils/logger";

// Initialize logger for main process
const logger = new Logger("Main");

/**
 * Main application class for Electron
 */
class GVAIBotApp {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    logger.info("🚀 Initializing GVAIBot Electron Application");
    this.setupApp();
  }

  /**
   * Setup application event handlers
   */
  private setupApp(): void {
    // App event handlers
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupIPC();
      this.setupMenu();

      // macOS: Re-create window when dock icon clicked
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // Quit when all windows are closed (except on macOS)
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    // Handle app shutdown
    app.on("before-quit", async () => {
      logger.info("🔄 Shutting down GVAIBot application...");
    });
  }

  /**
   * Create the main application window
   */
  private createMainWindow(): void {
    logger.info("🖼️ Creating main window...");

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        sandbox: false,
        webSecurity: true,
      },
      show: false,
    });

    // Load the main HTML file
    const htmlPath = path.join(__dirname, "../renderer/index.html");
    this.mainWindow.loadFile(htmlPath);

    // Show window when ready to prevent visual flash
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
      logger.info("✅ Main window displayed");

      // Open DevTools in development
      if (config.server.environment === "development") {
        this.mainWindow?.webContents.openDevTools();
      }
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      logger.info("🔄 Main window closed");
    });
  }

  /**
   * Setup IPC (Inter-Process Communication) handlers
   */
  private setupIPC(): void {
    logger.info("🔗 Setting up IPC handlers...");

    // Basic chat handler for testing
    ipcMain.handle("chat:send-message", async (event, message: string) => {
      try {
        logger.info("💬 Processing chat message");
        // Mock response for now
        const response = `Mock response to: ${message}`;
        return { success: true, response };
      } catch (error: any) {
        logger.error("❌ Error processing chat message");
        return { success: false, error: error?.message || "Unknown error" };
      }
    });

    // App configuration
    ipcMain.handle("app:get-config", () => {
      return {
        success: true,
        config: {
          aiProvider: config.ai.provider,
          environment: config.server.environment,
        },
      };
    });

    logger.info("✅ IPC handlers setup completed");
  }

  /**
   * Setup basic application menu
   */
  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "File",
        submenu: [
          {
            label: "New Chat",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              this.mainWindow?.webContents.send("chat:new");
            },
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    logger.info("✅ Application menu setup completed");
  }
}

// Create and initialize the application
const gvaiBotApp = new GVAIBotApp();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception");
  console.error(error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  logger.error("💥 Unhandled Rejection");
  console.error(reason);
});
