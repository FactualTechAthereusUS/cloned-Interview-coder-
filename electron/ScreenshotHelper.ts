// ScreenshotHelper.ts

import path from "node:path"
import fs from "node:fs"
import { app, screen, BrowserWindow } from "electron"
import { v4 as uuidv4 } from "uuid"
import { execFile } from "child_process"
import { promisify } from "util"
import screenshot from "screenshot-desktop"
import os from "os"

const execFileAsync = promisify(execFile)

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string
  private readonly tempDir: string

  private view: "queue" | "solutions" | "debug" = "queue"
  
  // Track current display ID
  private currentDisplayId: number | null = null

  constructor(view: "queue" | "solutions" | "debug" = "queue") {
    this.view = view

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )
    this.tempDir = path.join(app.getPath("temp"), "interview-coder-screenshots")

    // Create directories if they don't exist
    this.ensureDirectoriesExist();
    
    // Clean existing screenshot directories when starting the app
    this.cleanScreenshotDirectories();
  }
  
  private ensureDirectoriesExist(): void {
    const directories = [this.screenshotDir, this.extraScreenshotDir, this.tempDir];
    
    for (const dir of directories) {
      try {
      if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
          console.log(`Created directory: ${dir}`);
        }
        } catch (err) {
          console.error(`Error creating directory ${dir}:`, err);
        
        // Try creating parent directories first if recursive creation fails
        try {
          const parentDir = path.dirname(dir);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
          }
          
          // Then try creating the directory without recursive option
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { mode: 0o755 });
            console.log(`Created directory (second attempt): ${dir}`);
          }
        } catch (secondErr) {
          console.error(`Failed second attempt to create directory ${dir}:`, secondErr);
          // Continue with other directories instead of throwing
        }
      }
    }
  }
  
  // This method replaces loadExistingScreenshots() to ensure we start with empty queues
  private cleanScreenshotDirectories(): void {
    try {
      // Clean main screenshots directory
      if (fs.existsSync(this.screenshotDir)) {
        const files = fs.readdirSync(this.screenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.screenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting screenshot ${file}:`, err);
          }
        }
      }
      
      // Clean extra screenshots directory
      if (fs.existsSync(this.extraScreenshotDir)) {
        const files = fs.readdirSync(this.extraScreenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.extraScreenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing extra screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting extra screenshot ${file}:`, err);
          }
        }
      }
      
      console.log("Screenshot directories cleaned successfully");
    } catch (err) {
      console.error("Error cleaning screenshot directories:", err);
    }
  }

  public getView(): "queue" | "solutions" | "debug" {
    return this.view
  }

  public setView(view: "queue" | "solutions" | "debug"): void {
    console.log("Setting view in ScreenshotHelper:", view)
    console.log(
      "Current queues - Main:",
      this.screenshotQueue,
      "Extra:",
      this.extraScreenshotQueue
    )
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    console.log("Getting extra screenshot queue:", this.extraScreenshotQueue)
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  // Add method to get the current display based on window position
  private getCurrentDisplay(mainWindow: BrowserWindow | null): Electron.Display {
    try {
      if (!mainWindow) {
        console.log("No main window, using primary display");
        return screen.getPrimaryDisplay();
      }
      
      // Get window position
      const [x, y] = mainWindow.getPosition();
      console.log(`Window position: ${x}, ${y}`);
      
      // Find display containing this position
      const displayWithWindow = screen.getDisplayNearestPoint({ x, y });
      
      // Save the current display ID
      this.currentDisplayId = displayWithWindow.id;
      
      console.log(`Taking screenshot on display: ${displayWithWindow.id} (${displayWithWindow.size.width}x${displayWithWindow.size.height})`);
      return displayWithWindow;
    } catch (error) {
      console.error("Error getting current display:", error);
      return screen.getPrimaryDisplay();
    }
  }
  
  // Modified screenshot method for specific display
  private async captureScreenshot(mainWindow: BrowserWindow | null): Promise<Buffer> {
    try {
      console.log("Starting screenshot capture...");
      
      // Get current display
      const currentDisplay = this.getCurrentDisplay(mainWindow);
      
      // For Windows, try multiple methods
      if (process.platform === 'win32') {
        return await this.captureWindowsScreenshot(currentDisplay);
      } 
      
      // For macOS, try to capture specific display
      if (process.platform === 'darwin') {
        return await this.captureMacOSScreenshot(currentDisplay);
      }
      
      // Default fallback to all screens
      console.log("Taking screenshot with default method");
      const buffer = await screenshot({ format: 'png' });
      console.log(`Screenshot captured successfully, size: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }
  
  // New method for macOS screenshots of specific display
  private async captureMacOSScreenshot(display: Electron.Display): Promise<Buffer> {
    console.log(`Capturing macOS screenshot for display ${display.id}`);
    
    try {
      // First try to capture specific display by ID
      const allDisplays = screen.getAllDisplays();
      const displayIndex = allDisplays.findIndex(d => d.id === display.id);
      
      if (displayIndex >= 0) {
        console.log(`Display found at index ${displayIndex}`);
        
        // On macOS, screenshot-desktop can capture a specific display
        const buffer = await screenshot({
          screen: displayIndex,
          format: 'png'
        });
        
        console.log(`Captured display ${displayIndex}, size: ${buffer.length} bytes`);
        return buffer;
      } else {
        console.log("Display not found in getAllDisplays, falling back to default");
        const buffer = await screenshot({ format: 'png' });
        console.log(`Default screenshot captured, size: ${buffer.length} bytes`);
        return buffer;
      }
    } catch (error) {
      console.error("Error capturing macOS screenshot:", error);
      
      // Fallback to default if specific display capture fails
      try {
        console.log("Falling back to default screenshot method");
        const buffer = await screenshot({ format: 'png' });
        console.log(`Fallback screenshot captured, size: ${buffer.length} bytes`);
        return buffer;
      } catch (fallbackError) {
        console.error("Fallback screenshot failed:", fallbackError);
        throw new Error(`Failed to capture screenshot: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Windows-specific screenshot capture with multiple fallback mechanisms
   */
  private async captureWindowsScreenshot(display: Electron.Display): Promise<Buffer> {
    console.log(`Attempting Windows screenshot with multiple methods for display ${display.id}`);
    
    // Method 1: Try screenshot-desktop with filename first
    try {
      const tempFile = path.join(this.tempDir, `temp-${uuidv4()}.png`);
      console.log(`Taking Windows screenshot to temp file (Method 1): ${tempFile}`);
      
      // Try to get screenshot of specific display if available
      const allDisplays = screen.getAllDisplays();
      const displayIndex = allDisplays.findIndex(d => d.id === display.id);
      
      if (displayIndex >= 0) {
        console.log(`Capturing display ${displayIndex}`);
        await screenshot({ 
          filename: tempFile,
          screen: displayIndex 
        });
      } else {
        // Fall back to capturing all displays
        console.log("Display index not found, capturing all screens");
        await screenshot({ filename: tempFile });
      }
      
      if (fs.existsSync(tempFile)) {
        const buffer = await fs.promises.readFile(tempFile);
        console.log(`Method 1 successful, screenshot size: ${buffer.length} bytes`);
        
        // Cleanup temp file
        try {
          await fs.promises.unlink(tempFile);
        } catch (cleanupErr) {
          console.warn("Failed to clean up temp file:", cleanupErr);
        }
        
        return buffer;
      } else {
        console.log("Method 1 failed: File not created");
        throw new Error("Screenshot file not created");
      }
    } catch (error) {
      console.warn("Windows screenshot Method 1 failed:", error);
      
      // Method 2: Try using PowerShell
      try {
        console.log("Attempting Windows screenshot with PowerShell (Method 2)");
        const tempFile = path.join(this.tempDir, `ps-temp-${uuidv4()}.png`);
        
        // PowerShell command to take screenshot using .NET classes
        const psScript = `
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $top = ($screens | ForEach-Object {$_.Bounds.Top} | Measure-Object -Minimum).Minimum
        $left = ($screens | ForEach-Object {$_.Bounds.Left} | Measure-Object -Minimum).Minimum
        $width = ($screens | ForEach-Object {$_.Bounds.Right} | Measure-Object -Maximum).Maximum
        $height = ($screens | ForEach-Object {$_.Bounds.Bottom} | Measure-Object -Maximum).Maximum
        $bounds = [System.Drawing.Rectangle]::FromLTRB($left, $top, $width, $height)
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
        $bmp.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bmp.Dispose()
        `;
        
        // Execute PowerShell
        await execFileAsync('powershell', [
          '-NoProfile', 
          '-ExecutionPolicy', 'Bypass',
          '-Command', psScript
        ]);
        
        // Check if file exists and read it
        if (fs.existsSync(tempFile)) {
          const buffer = await fs.promises.readFile(tempFile);
          console.log(`Method 2 successful, screenshot size: ${buffer.length} bytes`);
          
          // Cleanup
          try {
            await fs.promises.unlink(tempFile);
          } catch (err) {
            console.warn("Failed to clean up PowerShell temp file:", err);
          }
          
          return buffer;
        } else {
          throw new Error("PowerShell screenshot file not created");
        }
      } catch (psError) {
        console.warn("Windows PowerShell screenshot failed:", psError);
        
        // Method 3: Last resort - create a tiny placeholder image
        console.log("All screenshot methods failed, creating placeholder image");
        
        // Create a 1x1 transparent PNG as fallback
        const fallbackBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        console.log("Created placeholder image as fallback");
        
        // Show the error but return a valid buffer so the app doesn't crash
        throw new Error("Could not capture screenshot with any method. Please check your Windows security settings and try again.");
      }
    }
  }

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void,
    mainWindow: BrowserWindow | null = null
  ): Promise<string> {
    console.log("Taking screenshot in view:", this.view)
    hideMainWindow()
    
    // Increased delay for window hiding on Windows
    const hideDelay = process.platform === 'win32' ? 500 : 300;
    await new Promise((resolve) => setTimeout(resolve, hideDelay))

    let screenshotPath = ""
    try {
      // Get screenshot buffer using cross-platform method
      const screenshotBuffer = await this.captureScreenshot(mainWindow);
      
      if (!screenshotBuffer || screenshotBuffer.length === 0) {
        throw new Error("Screenshot capture returned empty buffer");
      }

      // Save and manage the screenshot based on current view
      if (this.view === "queue") {
        screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
        await fs.promises.writeFile(screenshotPath, screenshotBuffer)
        console.log("Adding screenshot to main queue:", screenshotPath)
        this.screenshotQueue.push(screenshotPath)
        if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.screenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
              console.log(
                "Removed old screenshot from main queue:",
                removedPath
              )
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      } else {
        // In solutions view, only add to extra queue
        screenshotPath = path.join(this.extraScreenshotDir, `${uuidv4()}.png`)
        await fs.promises.writeFile(screenshotPath, screenshotBuffer)
        console.log("Adding screenshot to extra queue:", screenshotPath)
        this.extraScreenshotQueue.push(screenshotPath)
        if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.extraScreenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
              console.log(
                "Removed old screenshot from extra queue:",
                removedPath
              )
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      }
    } catch (error) {
      console.error("Screenshot error:", error)
      throw error
    } finally {
      // Increased delay for showing window again
      await new Promise((resolve) => setTimeout(resolve, 200))
      showMainWindow()
    }

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      if (!fs.existsSync(filepath)) {
        console.error(`Image file not found: ${filepath}`);
        return '';
      }
      
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      return ''
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (fs.existsSync(path)) {
        await fs.promises.unlink(path)
      }
      
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: error.message }
    }
  }

  public clearExtraScreenshotQueue(): void {
    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      if (fs.existsSync(screenshotPath)) {
        fs.unlink(screenshotPath, (err) => {
          if (err)
            console.error(
              `Error deleting extra screenshot at ${screenshotPath}:`,
              err
            )
        })
      }
    })
    this.extraScreenshotQueue = []
  }
}
