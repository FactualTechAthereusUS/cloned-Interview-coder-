import { globalShortcut, app } from "electron"
import { IShortcutsHelperDeps } from "./main"
import { configHelper } from "./ConfigHelper"

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  private adjustOpacity(delta: number): void {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) {
      console.log("Cannot adjust opacity: no main window found");
      return;
    }
    
    let currentOpacity = mainWindow.getOpacity();
    let newOpacity = Math.max(0.1, Math.min(1.0, currentOpacity + delta));
    console.log(`Adjusting opacity from ${currentOpacity} to ${newOpacity}`);
    
    // Update the window opacity (this should always work regardless of file system access)
    mainWindow.setOpacity(newOpacity);
    
    // If we're making the window fully transparent, also ignore mouse events
    if (newOpacity <= 0.1) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
    
    // Save the opacity setting to config without re-initializing the client
    // Wrap this in a try/catch and don't let it affect the UI if it fails
    try {
      const config = configHelper.loadConfig();
      config.opacity = newOpacity;
      
      // Use setTimeout to avoid blocking the UI thread
      setTimeout(() => {
        try {
          configHelper.saveConfig(config);
          console.log(`Opacity saved to config: ${newOpacity}`);
        } catch (saveError) {
          console.error('Async error saving opacity to config:', saveError);
          // Just log the error and continue - opacity is already applied to the UI
        }
      }, 0);
    } catch (error) {
      console.error('Error preparing to save opacity to config:', error);
      // Even if config saving fails, we've already updated the UI opacity
    }
    
    // Update visibility state based on opacity
    if (newOpacity <= 0.1 && this.deps.isVisible()) {
      // If opacity became too low but state says visible, synchronize by force hiding
      console.log("Opacity is now <= 0.1, forcing to hidden state");
      this.deps.toggleMainWindow();
    } else if (newOpacity > 0.1 && !this.deps.isVisible()) {
      // If we're making the window visible via opacity but state says hidden, synchronize to visible
      console.log("Opacity is now > 0.1 but window state is hidden, forcing to visible state");
      this.deps.toggleMainWindow();
    }
  }

  public registerGlobalShortcuts(): void {
    // Add error handling and better logging for shortcuts
    const registerShortcut = (accelerator: string, callback: () => void, description: string) => {
      try {
        console.log(`Registering shortcut: ${accelerator} for ${description}`);
        const success = globalShortcut.register(accelerator, () => {
          console.log(`Shortcut triggered: ${accelerator} (${description})`);
          try {
            callback();
          } catch (callbackError) {
            console.error(`Error in shortcut callback for ${accelerator}:`, callbackError);
          }
        });
        
        if (!success) {
          console.error(`Failed to register shortcut: ${accelerator}`);
        }
      } catch (error) {
        console.error(`Error registering shortcut ${accelerator}:`, error);
      }
    };

    // Unregister all existing shortcuts first to avoid duplicates
    globalShortcut.unregisterAll();
    
    // Register screenshot shortcut
    registerShortcut("CommandOrControl+H", async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.deps.takeScreenshot()
          const preview = await this.deps.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    }, "take screenshot");

    // Register process screenshots shortcut
    registerShortcut("CommandOrControl+Enter", async () => {
      await this.deps.processingHelper?.processScreenshots()
    }, "process screenshots");

    // Register reset shortcut
    registerShortcut("CommandOrControl+R", () => {
      console.log("Command + R pressed. Canceling requests and resetting queues...")
      this.deps.processingHelper?.cancelOngoingRequests()
      this.deps.clearQueues()
      console.log("Cleared queues.")
      this.deps.setView("queue")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }
    }, "reset application");

    // Window movement shortcuts
    registerShortcut("CommandOrControl+Left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    }, "move window left");

    registerShortcut("CommandOrControl+Right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    }, "move window right");

    registerShortcut("CommandOrControl+Down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.deps.moveWindowDown()
    }, "move window down");

    registerShortcut("CommandOrControl+Up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.deps.moveWindowUp()
    }, "move window up");

    // Toggle visibility shortcut - CMD+B - This is the key one we need to fix
    registerShortcut("CommandOrControl+B", () => {
      console.log("Command/Ctrl + B pressed. Toggling window visibility.");
      // Check if the isVisible dependency works correctly
      const isCurrentlyVisible = this.deps.isVisible();
      console.log(`Current visibility state from deps.isVisible(): ${isCurrentlyVisible}`);
      
      // Force toggle regardless of current state
      this.deps.toggleMainWindow();
    }, "toggle window visibility");

    // Quit application shortcut
    registerShortcut("CommandOrControl+Q", () => {
      console.log("Command/Ctrl + Q pressed. Quitting application.");
      try {
        // Forcefully quit the application
        setTimeout(() => {
          app.exit(0);
        }, 100);
      } catch (error) {
        console.error("Failed to quit normally, forcing exit:", error);
        process.exit(0);
      }
    }, "quit application");

    // Add alternative quit shortcut - Cmd+Alt+Q (Option+Cmd+Q on Mac)
    registerShortcut("CommandOrControl+Alt+Q", () => {
      console.log("Command/Alt + Q pressed. Force quitting application.");
      try {
        app.exit(0);
      } catch (error) {
        console.error("Failed to quit with app.exit, using process.exit:", error);
        process.exit(0);
      }
    }, "force quit application");

    // Adjust opacity shortcuts
    registerShortcut("CommandOrControl+[", () => {
      console.log("Command/Ctrl + [ pressed. Decreasing opacity.")
      this.adjustOpacity(-0.1)
    }, "decrease opacity");

    registerShortcut("CommandOrControl+]", () => {
      console.log("Command/Ctrl + ] pressed. Increasing opacity.")
      this.adjustOpacity(0.1)
    }, "increase opacity");
    
    // Zoom controls
    registerShortcut("CommandOrControl+-", () => {
      console.log("Command/Ctrl + - pressed. Zooming out.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom - 0.5)
      }
    }, "zoom out");
    
    registerShortcut("CommandOrControl+0", () => {
      console.log("Command/Ctrl + 0 pressed. Resetting zoom.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(0)
      }
    }, "reset zoom");
    
    registerShortcut("CommandOrControl+=", () => {
      console.log("Command/Ctrl + = pressed. Zooming in.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom + 0.5)
      }
    }, "zoom in");
    
    // Delete last screenshot shortcut
    registerShortcut("CommandOrControl+L", () => {
      console.log("Command/Ctrl + L pressed. Deleting last screenshot.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("delete-last-screenshot")
      }
    }, "delete last screenshot");
    
    // Add new shortcuts for moving between displays
    registerShortcut("CommandOrControl+D", () => {
      console.log("Command/Ctrl + D pressed. Moving to next display.");
      this.deps.moveToNextDisplay();
    }, "move to next display");
    
    registerShortcut("CommandOrControl+Shift+D", () => {
      console.log("Command/Ctrl + Shift + D pressed. Moving to previous display.");
      this.deps.moveToPreviousDisplay();
    }, "move to previous display");

    // Add shortcut for click-through mode
    registerShortcut("CommandOrControl+T", () => {
      console.log("Command/Ctrl + T pressed. Toggling click-through mode.");
      this.deps.toggleClickThrough();
    }, "toggle click-through mode");
    
    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      console.log("Unregistering all shortcuts on app quit");
      globalShortcut.unregisterAll()
    })
    
    // Log all registered shortcuts
    console.log("Global shortcuts registered successfully");
  }
}
