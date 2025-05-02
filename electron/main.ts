import { app, BrowserWindow, screen, shell, ipcMain, Tray, Menu } from "electron"
import path from "path"
import fs from "fs"
import { initializeIpcHandlers } from "./ipcHandlers"
import { ProcessingHelper } from "./ProcessingHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { initAutoUpdater } from "./autoUpdater"
import { configHelper } from "./ConfigHelper"
import * as dotenv from "dotenv"
import os from "os"

// Constants
const isDev = process.env.NODE_ENV === "development"

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  tray: null as Tray | null,  // Add tray property
  isWindowVisible: false,
  isClickThroughEnabled: false,  // New state property to track click-through mode
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  currentDisplay: null as Electron.Display | null,  // Current display the window is on
  allDisplays: [] as Electron.Display[],  // All available displays
  step: 0,
  currentX: 0,
  currentY: 0,

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as ProcessingHelper | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,

  // Processing events
  PROCESSING_EVENTS: {
    UNAUTHORIZED: "processing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    OUT_OF_CREDITS: "out-of-credits",
    API_KEY_INVALID: "api-key-invalid",
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const
}

// Ensure the app is hidden from the dock before anything else happens
if (process.platform === "darwin") {
  try {
    app.dock.hide();
    console.log("App hidden from dock at startup");
  } catch (error) {
    console.error("Failed to hide from dock:", error);
  }
}

// Add interfaces for helper classes
export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null
  getMainWindow: () => BrowserWindow | null
  getView: () => "queue" | "solutions" | "debug"
  setView: (view: "queue" | "solutions" | "debug") => void
  getProblemInfo: () => any
  setProblemInfo: (info: any) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  clearQueues: () => void
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  setHasDebugged: (value: boolean) => void
  getHasDebugged: () => boolean
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  moveToNextDisplay: () => void
  moveToPreviousDisplay: () => void
  toggleClickThrough: () => void  // Add click-through toggle
  isClickThroughEnabled: () => boolean  // Add click-through state checker
}

export interface IIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  setWindowDimensions: (width: number, height: number) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: ProcessingHelper | null
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
  takeScreenshot: () => Promise<string>
  getView: () => "queue" | "solutions" | "debug"
  toggleMainWindow: () => void
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  moveToNextDisplay: () => void
  moveToPreviousDisplay: () => void
  toggleClickThrough: () => void  // Add click-through toggle
  isClickThroughEnabled: () => boolean  // Add click-through state checker
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view)
  state.processingHelper = new ProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getView,
    setView,
    getProblemInfo,
    setProblemInfo,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    getImagePreview,
    deleteScreenshot,
    setHasDebugged,
    getHasDebugged,
    PROCESSING_EVENTS: state.PROCESSING_EVENTS
  } as IProcessingHelperDeps)
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    takeScreenshot,
    getImagePreview,
    processingHelper: state.processingHelper,
    clearQueues,
    setView,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) =>
        Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
      ),
    moveWindowRight: () =>
      moveWindowHorizontal((x) =>
        Math.min(
          (state.currentDisplay?.bounds.x || 0) + (state.screenWidth) - (state.windowSize?.width || 0) / 2,
          x + state.step
        )
      ),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step),
    moveToNextDisplay: () => moveToDisplay('next'),
    moveToPreviousDisplay: () => moveToDisplay('previous'),
    toggleClickThrough,  // Add click-through toggle
    isClickThroughEnabled: () => state.isClickThroughEnabled  // Add click-through state checker
  } as IShortcutsHelperDeps)
}

// Auth callback handler

// Register the interview-coder protocol
if (process.platform === "darwin") {
  app.setAsDefaultProtocolClient("interview-coder")
} else {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1] || "")
  ])
}

// Handle the protocol. In this case, we choose to show an Error Box.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1])
  ])
}

// Force Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.focus()

      // Protocol handler removed - no longer using auth callbacks
    }
  })
}

// Auth callback removed as we no longer use Supabase authentication

// Window management functions
async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.focus()
    return
  }

  // Get display information
  getDisplayInfo();
  
  // Make absolutely sure we're hidden from dock on macOS
  if (process.platform === "darwin") {
    try {
      // Set activation policy to accessory which helps prevent dock icon
      app.setActivationPolicy('accessory');
      app.dock.hide();
      console.log("App hidden from dock in createWindow");
    } catch (error) {
      console.error("Failed to hide from dock in createWindow:", error);
    }
  }
  
  // Set initial positions based on current display
  const workArea = state.currentDisplay?.workArea || screen.getPrimaryDisplay().workArea;
  state.step = 60;
  
  // Center the window horizontally on the current display
  state.currentX = workArea.x + (workArea.width / 2) - 400; // 400 is half the window width
  state.currentY = workArea.y + 50; // Position 50px from the top

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    width: 800,
    height: 600,
    minWidth: 750,
    minHeight: 550,
    x: state.currentX,
    y: state.currentY,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, "../dist-electron/preload.js")
        : path.join(__dirname, "preload.js"),
      scrollBounce: true
    },
    show: true,
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 0.2,  // Make default opacity more translucent
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    type: "panel",
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    enableLargerThanScreen: true,
    movable: true
  }

  state.mainWindow = new BrowserWindow(windowSettings)

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading")
  })
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription)
      if (isDev) {
        // In development, retry loading after a short delay
        console.log("Retrying to load development server...")
        setTimeout(() => {
          state.mainWindow?.loadURL("http://localhost:54321").catch((error) => {
            console.error("Failed to load dev server on retry:", error)
          })
        }, 1000)
      }
    }
  )

  if (isDev) {
    // In development, load from the dev server
    console.log("Loading from development server: http://localhost:54321")
    state.mainWindow.loadURL("http://localhost:54321").catch((error) => {
      console.error("Failed to load dev server, falling back to local file:", error)
      // Fallback to local file if dev server is not available
      const indexPath = path.join(__dirname, "../dist/index.html")
      console.log("Falling back to:", indexPath)
      if (fs.existsSync(indexPath)) {
        state.mainWindow.loadFile(indexPath)
      } else {
        console.error("Could not find index.html in dist folder")
      }
    })
  } else {
    // In production, load from the built files
    const indexPath = path.join(__dirname, "../dist/index.html")
    console.log("Loading production build:", indexPath)
    
    if (fs.existsSync(indexPath)) {
      state.mainWindow.loadFile(indexPath)
    } else {
      console.error("Could not find index.html in dist folder")
    }
  }

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1)
  if (isDev) {
    state.mainWindow.webContents.openDevTools()
  }
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Attempting to open URL:", url)
    try {
      const parsedURL = new URL(url);
      const hostname = parsedURL.hostname;
      const allowedHosts = ["google.com", "supabase.co"];
      if (allowedHosts.includes(hostname) || hostname.endsWith(".google.com") || hostname.endsWith(".supabase.co")) {
        shell.openExternal(url);
        return { action: "deny" }; // Do not open this URL in a new Electron window
      }
    } catch (error) {
      console.error("Invalid URL %d in setWindowOpenHandler: %d" , url , error);
      return { action: "deny" }; // Deny access as URL string is malformed or invalid
    }
    return { action: "allow" };
  })

  // Enhanced screen capture resistance
  state.mainWindow.setContentProtection(true)

  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  })
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)

  // Additional screen capture resistance settings
  if (process.platform === "darwin") {
    // Prevent window from being captured in screenshots
    state.mainWindow.setHiddenInMissionControl(true)
    state.mainWindow.setWindowButtonVisibility(false)
    state.mainWindow.setBackgroundColor("#00000000")

    // Prevent window from being included in window switcher
    state.mainWindow.setSkipTaskbar(true)

    // Disable window shadow
    state.mainWindow.setHasShadow(false)
  }

  // Prevent the window from being captured by screen recording
  state.mainWindow.webContents.setBackgroundThrottling(false)
  state.mainWindow.webContents.setFrameRate(60)

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove)
  state.mainWindow.on("resize", handleWindowResize)
  state.mainWindow.on("closed", handleWindowClosed)

  // Initialize window state
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.windowSize = { width: bounds.width, height: bounds.height }
  state.currentX = bounds.x
  state.currentY = bounds.y

  // Make sure to set isWindowVisible based on opacity value
  const savedOpacity = configHelper.getOpacity();
  console.log(`Initial opacity from config: ${savedOpacity}`);

  // Always make sure window is shown first for initialization
  state.mainWindow.showInactive();

  // Enable click-through by default
  state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
  state.isClickThroughEnabled = true;
  console.log('Click-through enabled by default');

  if (savedOpacity <= 0.1) {
    console.log('Initial opacity too low, setting to 0 and hiding window');
    state.mainWindow.setOpacity(0);
    state.isWindowVisible = false;
    console.log('Window initially hidden, isWindowVisible set to false');
  } else {
    console.log(`Setting initial opacity to ${savedOpacity}`);
    state.mainWindow.setOpacity(savedOpacity);
    state.isWindowVisible = true;
    console.log('Window initially visible, isWindowVisible set to true');
  }
}

function handleWindowMove(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.currentX = bounds.x
  state.currentY = bounds.y
}

function handleWindowResize(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowSize = { width: bounds.width, height: bounds.height }
}

function handleWindowClosed(): void {
  state.mainWindow = null
  state.isWindowVisible = false
  state.windowPosition = null
  state.windowSize = null
}

// Window visibility functions
function hideMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    console.log('Hiding window, current opacity:', state.mainWindow.getOpacity());
    const bounds = state.mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y };
    state.windowSize = { width: bounds.width, height: bounds.height };
    
    // Save current opacity in case we need to restore it
    const currentOpacity = state.mainWindow.getOpacity();
    
    // First set ignore mouse events to prevent interaction
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    
    // Then set opacity to 0
    state.mainWindow.setOpacity(0);
    
    // Update state
    state.isWindowVisible = false;
    
    console.log('Window hidden, opacity set to 0, isWindowVisible:', state.isWindowVisible);
    
    // Store the opacity setting in config for persistence
    try {
      const config = configHelper.loadConfig();
      if (currentOpacity > 0.1) {
        config.opacity = currentOpacity;
        configHelper.saveConfig(config);
      }
    } catch (error) {
      console.error('Error saving opacity to config:', error);
    }
  }
}

function showMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    console.log('Showing window, current state:', state.isWindowVisible);
    
    // Ensure proper window position
    if (state.windowPosition && state.windowSize) {
      state.mainWindow.setBounds({
        ...state.windowPosition,
        ...state.windowSize
      });
    }
    
    // Get saved opacity from config, default to 0.2 (more translucent) if not available
    let targetOpacity;
    try {
      targetOpacity = configHelper.getOpacity();
      if (targetOpacity <= 0.1) targetOpacity = 0.2; // Ensure minimum visibility but very translucent
    } catch (error) {
      console.error('Error loading opacity from config:', error);
      targetOpacity = 0.2;
    }
    
    console.log('Setting window to visible with opacity:', targetOpacity);
    
    // Make sure window is shown
    state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    state.mainWindow.setContentProtection(true);
    
    // First set opacity to 0 before showing
    state.mainWindow.setOpacity(0);
    
    // Then show window without focusing
    state.mainWindow.showInactive();
    
    // Enable click-through by default for better user experience
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isClickThroughEnabled = true;
    
    // Finally set opacity to saved value or default
    state.mainWindow.setOpacity(targetOpacity);
    
    // Update state
    state.isWindowVisible = true;
    
    console.log('Window shown, opacity set to', targetOpacity, 
      ', isWindowVisible:', state.isWindowVisible, 
      ', isClickThroughEnabled:', state.isClickThroughEnabled);
  }
}

function toggleMainWindow(): void {
  console.log(`Toggling window. Current state: ${state.isWindowVisible ? 'visible' : 'hidden'}, mainWindow exists: ${!!state.mainWindow}`);
  
  // Safety check - if window doesn't exist, try to create it
  if (!state.mainWindow) {
    console.log('Window does not exist, attempting to create it first');
    createWindow().then(() => {
      // After window is created, show it
      showMainWindow();
    }).catch(err => {
      console.error('Failed to create window:', err);
    });
    return;
  }
  
  // Extra check to make sure opacity matches visibility state
  const currentOpacity = state.mainWindow.getOpacity();
  console.log(`Current opacity: ${currentOpacity}, isWindowVisible: ${state.isWindowVisible}`);
  
  // If opacity and visibility state are mismatched, fix it
  if (currentOpacity > 0.1 && !state.isWindowVisible) {
    console.log('Opacity > 0.1 but isWindowVisible is false, fixing state...');
    state.isWindowVisible = true;
  } else if (currentOpacity <= 0.1 && state.isWindowVisible) {
    console.log('Opacity <= 0.1 but isWindowVisible is true, fixing state...');
    state.isWindowVisible = false;
  }
  
  // Now toggle based on (potentially fixed) state
  if (state.isWindowVisible) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  if (!state.mainWindow) return;
  
  const newX = updateFn(state.currentX);
  // Get current position to determine if we're moving between displays
  const [currentX, currentY] = state.mainWindow.getPosition();
  
  // Set new position
  state.currentX = newX;
  state.mainWindow.setPosition(Math.round(newX), Math.round(state.currentY));
  
  // Check if we've moved to a different display
  const newDisplay = getDisplayAtPoint(newX, state.currentY);
  if (newDisplay.id !== state.currentDisplay?.id) {
    console.log(`Moving to new display: ${newDisplay.id} from ${state.currentDisplay?.id}`);
    state.currentDisplay = newDisplay;
    
    // Update screen dimensions based on new display
    state.screenWidth = newDisplay.workAreaSize.width;
    state.screenHeight = newDisplay.workAreaSize.height;
    
    console.log(`Updated screen dimensions: ${state.screenWidth}x${state.screenHeight}`);
  }
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  if (!state.mainWindow) return;

  const newY = updateFn(state.currentY);
  
  // These limits are relative to the current display's bounds
  // Allow window to go 2/3 off screen in either direction
  const displayBounds = state.currentDisplay?.bounds || screen.getPrimaryDisplay().bounds;
  const maxUpLimit = displayBounds.y - ((state.windowSize?.height || 0) * 2) / 3;
  const maxDownLimit = displayBounds.y + displayBounds.height + ((state.windowSize?.height || 0) * 2) / 3;

  // Log the current state and limits
  console.log({
    newY,
    maxUpLimit,
    maxDownLimit,
    displayY: displayBounds.y,
    displayHeight: displayBounds.height,
    windowHeight: state.windowSize?.height,
    currentY: state.currentY
  });

  // Only update if within bounds
  if (newY >= maxUpLimit && newY <= maxDownLimit) {
    state.currentY = newY;
    state.mainWindow.setPosition(Math.round(state.currentX), Math.round(state.currentY));
    
    // Check if we've moved to a different display
    const newDisplay = getDisplayAtPoint(state.currentX, newY);
    if (newDisplay.id !== state.currentDisplay?.id) {
      console.log(`Moving to new display: ${newDisplay.id} from ${state.currentDisplay?.id}`);
      state.currentDisplay = newDisplay;
      
      // Update screen dimensions based on new display
      state.screenWidth = newDisplay.workAreaSize.width;
      state.screenHeight = newDisplay.workAreaSize.height;
      
      console.log(`Updated screen dimensions: ${state.screenWidth}x${state.screenHeight}`);
    }
  }
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (!state.mainWindow?.isDestroyed()) {
    const [currentX, currentY] = state.mainWindow.getPosition();
    
    // Get work area of current display
    const workArea = state.currentDisplay?.workArea || screen.getPrimaryDisplay().workArea;
    const maxWidth = Math.floor(workArea.width * 0.5);

    state.mainWindow.setBounds({
      x: Math.min(currentX, workArea.x + workArea.width - maxWidth),
      y: currentY,
      width: Math.min(width + 32, maxWidth),
      height: Math.ceil(height)
    });
  }
}

// Add function to move window to next/previous display
function moveToDisplay(direction: 'next' | 'previous'): void {
  if (!state.mainWindow) return;
  
  // Get all available displays
  const displays = state.allDisplays;
  if (displays.length <= 1) {
    console.log('Only one display available, cannot move');
    return;
  }
  
  // Find current display index
  const currentDisplayId = state.currentDisplay?.id;
  const currentIndex = displays.findIndex(d => d.id === currentDisplayId);
  
  if (currentIndex === -1) {
    console.error('Current display not found in display list');
    return;
  }
  
  // Calculate next/previous display index
  let newIndex: number;
  if (direction === 'next') {
    newIndex = (currentIndex + 1) % displays.length;
  } else {
    newIndex = (currentIndex - 1 + displays.length) % displays.length;
  }
  
  const newDisplay = displays[newIndex];
  console.log(`Moving window from display ${currentIndex} to display ${newIndex}`);
  
  // Get current window size
  const bounds = state.mainWindow.getBounds();
  const windowWidth = bounds.width;
  const windowHeight = bounds.height;
  
  // Calculate new position centered in the target display
  const newX = newDisplay.workArea.x + (newDisplay.workArea.width / 2) - (windowWidth / 2);
  const newY = newDisplay.workArea.y + 50; // Position near top of screen
  
  // Update window position
  state.mainWindow.setPosition(Math.round(newX), Math.round(newY));
  
  // Update state
  state.currentX = newX;
  state.currentY = newY;
  state.currentDisplay = newDisplay;
  state.screenWidth = newDisplay.workAreaSize.width;
  state.screenHeight = newDisplay.workAreaSize.height;
  
  console.log(`Window moved to display ${newIndex}: ${newDisplay.size.width}x${newDisplay.size.height}`);
}

// Environment setup
function loadEnvVariables() {
  if (isDev) {
    console.log("Loading env variables from:", path.join(process.cwd(), ".env"))
    dotenv.config({ path: path.join(process.cwd(), ".env") })
  } else {
    console.log(
      "Loading env variables from:",
      path.join(process.resourcesPath, ".env")
    )
    dotenv.config({ path: path.join(process.resourcesPath, ".env") })
  }
  console.log("Environment variables loaded for open-source version")
}

// Add function to create tray icon
function createTray(): void {
  if (state.tray) {
    state.tray.destroy();
  }

  try {
    // Use a default icon for the tray
    let iconPath = "";
    if (isDev) {
      iconPath = path.join(process.cwd(), 'assets/icon.png');
    } else {
      iconPath = path.join(process.resourcesPath, 'assets/icon.png');
    }

    // Create the tray instance
    state.tray = new Tray(iconPath);
    state.tray.setToolTip('Interview Coder');
    
    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Show/Hide', 
        click: () => toggleMainWindow() 
      },
      { type: 'separator' },
      { 
        label: 'Quit', 
        click: () => {
          console.log('Quitting from tray menu');
          if (state.mainWindow) {
            state.mainWindow.destroy();
          }
          app.quit();
        } 
      }
    ]);
    
    // Set the context menu
    state.tray.setContextMenu(contextMenu);
    
    // Click handler
    state.tray.on('click', () => {
      toggleMainWindow();
    });
    
    console.log('Tray icon created successfully');
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    // Continue even if tray creation fails
  }
}

// Initialize application
async function initializeApp() {
  try {
    // Set custom cache directory to prevent permission issues
    let appDataPath: string;
    let sessionPath: string;
    let tempPath: string;
    let cachePath: string;
    let useAlternativePaths = false;
    
    try {
      // Try to use the standard app data path
      appDataPath = path.join(app.getPath('appData'), 'interview-coder-v1');
      console.log(`Using standard app data path: ${appDataPath}`);
    } catch (appDataErr) {
      console.error("Error accessing app data path:", appDataErr);
      
      // Fallback to home directory
      try {
        const homeDir = app.getPath('home');
        appDataPath = path.join(homeDir, '.interview-coder');
        console.log(`Using fallback app data path: ${appDataPath}`);
        useAlternativePaths = true;
      } catch (homeErr) {
        console.error("Error accessing home directory:", homeErr);
        
        // Last resort: use temp directory
        appDataPath = path.join(os.tmpdir(), 'interview-coder-temp');
        console.log(`Using temporary directory as last resort: ${appDataPath}`);
        useAlternativePaths = true;
      }
    }
    
    // Define other paths based on the app data path
    sessionPath = path.join(appDataPath, 'session');
    tempPath = path.join(appDataPath, 'temp');
    cachePath = path.join(appDataPath, 'cache');
    
    // Create directories if they don't exist with better error handling
    const directories = [appDataPath, sessionPath, tempPath, cachePath];
    let dirCreationSuccess = true;
    
    for (const dir of directories) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
          console.log(`Successfully created directory: ${dir}`);
        }
        
        // Verify we can write to the directory
        const testPath = path.join(dir, '.test_write_permissions');
        fs.writeFileSync(testPath, 'test');
        fs.unlinkSync(testPath);
      } catch (err) {
        console.error(`Error creating or verifying directory ${dir}:`, err);
        dirCreationSuccess = false;
        
        // Don't break the loop, try to create all directories we can
        continue;
      }
    }
    
    // Set application paths if directory creation was successful
    if (dirCreationSuccess) {
      try {
        app.setPath('userData', appDataPath);
        app.setPath('sessionData', sessionPath);      
        app.setPath('temp', tempPath);
        app.setPath('cache', cachePath);
        console.log("Application paths set successfully");
      } catch (pathErr) {
        console.error("Error setting application paths:", pathErr);
        // Continue even if paths couldn't be set
      }
    } else if (!useAlternativePaths) {
      // If we couldn't create directories but haven't tried alternative paths yet,
      // try again with home directory
      console.log("Retrying with alternative paths...");
      try {
        const homeDir = app.getPath('home');
        appDataPath = path.join(homeDir, '.interview-coder');
        sessionPath = path.join(appDataPath, 'session');
        tempPath = path.join(appDataPath, 'temp');
        cachePath = path.join(appDataPath, 'cache');
        
        // Create these directories
        for (const dir of [appDataPath, sessionPath, tempPath, cachePath]) {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
          }
        }
        
        // Try to set paths
        app.setPath('userData', appDataPath);
        app.setPath('sessionData', sessionPath);
        app.setPath('temp', tempPath);
        app.setPath('cache', cachePath);
        console.log("Alternative application paths set successfully");
      } catch (retryErr) {
        console.error("Error setting alternative paths:", retryErr);
        // Continue with default paths
      }
    }
    
    loadEnvVariables();
    
    // Ensure a configuration file exists
    if (!configHelper.hasApiKey()) {
      console.log("No API key found in configuration. User will need to set up.");
    }
    
    // Create tray icon
    createTray();
    
    initializeHelpers();
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            (state.currentDisplay?.bounds.x || 0) + (state.screenWidth) - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      moveToNextDisplay: () => moveToDisplay('next'),
      moveToPreviousDisplay: () => moveToDisplay('previous'),
      toggleClickThrough,  // Add click-through toggle
      isClickThroughEnabled: () => state.isClickThroughEnabled  // Add click-through state checker
    });
    
    await createWindow();
    state.shortcutsHelper?.registerGlobalShortcuts();

    // Initialize auto-updater regardless of environment
    initAutoUpdater();
    console.log(
      "Auto-updater initialized in",
      isDev ? "development" : "production",
      "mode"
    );
  } catch (error) {
    console.error("Failed to initialize application:", error);
    
    // Try a minimal initialization to at least get the app running
    try {
      console.log("Attempting minimal initialization...");
      initializeHelpers();
      await createWindow();
      if (state.shortcutsHelper) {
        state.shortcutsHelper.registerGlobalShortcuts();
      }
    } catch (minimalError) {
      console.error("Even minimal initialization failed:", minimalError);
      app.quit();
    }
  }
}

// Auth callback handling removed - no longer needed
app.on("open-url", (event, url) => {
  console.log("open-url event received:", url)
  event.preventDefault()
})

// Handle second instance (removed auth callback handling)
app.on("second-instance", (event, commandLine) => {
  console.log("second-instance event received:", commandLine)
  
  // Focus or create the main window
  if (!state.mainWindow) {
    createWindow()
  } else {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.focus()
  }
})

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
      state.mainWindow = null
    }
  })
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

function getView(): "queue" | "solutions" | "debug" {
  return state.view
}

function setView(view: "queue" | "solutions" | "debug"): void {
  state.view = view
  state.screenshotHelper?.setView(view)
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper
}

function getProblemInfo(): any {
  return state.problemInfo
}

function setProblemInfo(problemInfo: any): void {
  state.problemInfo = problemInfo
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || []
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || []
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues()
  state.problemInfo = null
  setView("queue")
}

async function takeScreenshot(): Promise<string> {
  if (!state.mainWindow) throw new Error("No main window available")
  return (
    state.screenshotHelper?.takeScreenshot(
      () => hideMainWindow(),
      () => showMainWindow(),
      state.mainWindow
    ) || ""
  )
}

async function getImagePreview(filepath: string): Promise<string> {
  return state.screenshotHelper?.getImagePreview(filepath) || ""
}

async function deleteScreenshot(
  path: string
): Promise<{ success: boolean; error?: string }> {
  return (
    state.screenshotHelper?.deleteScreenshot(path) || {
      success: false,
      error: "Screenshot helper not initialized"
    }
  )
}

function setHasDebugged(value: boolean): void {
  state.hasDebugged = value
}

function getHasDebugged(): boolean {
  return state.hasDebugged
}

// Add a function to get display information
function getDisplayInfo(): void {
  try {
    state.allDisplays = screen.getAllDisplays();
    console.log(`Found ${state.allDisplays.length} displays`);
    
    // Use primary display as default
    state.currentDisplay = screen.getPrimaryDisplay();
    
    // Log display information
    state.allDisplays.forEach((display, index) => {
      const isPrimary = display.id === state.currentDisplay?.id ? '(primary)' : '';
      console.log(`Display ${index}: ${display.size.width}x${display.size.height} at (${display.bounds.x}, ${display.bounds.y}) ${isPrimary}`);
    });
    
    // Set screen dimensions based on current display
    if (state.currentDisplay) {
      state.screenWidth = state.currentDisplay.workAreaSize.width;
      state.screenHeight = state.currentDisplay.workAreaSize.height;
      console.log(`Using display: ${state.screenWidth}x${state.screenHeight}`);
    }
  } catch (error) {
    console.error('Error getting display information:', error);
    // Fallback to primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    state.screenWidth = primaryDisplay.workAreaSize.width;
    state.screenHeight = primaryDisplay.workAreaSize.height;
    state.currentDisplay = primaryDisplay;
    console.log(`Using primary display as fallback: ${state.screenWidth}x${state.screenHeight}`);
  }
}

// Function to find which display contains a point
function getDisplayAtPoint(x: number, y: number): Electron.Display {
  for (const display of state.allDisplays) {
    const { x: dX, y: dY, width, height } = display.bounds;
    if (x >= dX && x < dX + width && y >= dY && y < dY + height) {
      return display;
    }
  }
  // Default to current display if no match
  return state.currentDisplay || screen.getPrimaryDisplay();
}

// Add functions to toggle click-through mode
function enableClickThrough(): void {
  if (!state.mainWindow?.isDestroyed()) {
    console.log('Enabling click-through mode');
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    state.isClickThroughEnabled = true;
  }
}

function disableClickThrough(): void {
  if (!state.mainWindow?.isDestroyed()) {
    console.log('Disabling click-through mode');
    state.mainWindow.setIgnoreMouseEvents(false);
    state.isClickThroughEnabled = false;
  }
}

function toggleClickThrough(): void {
  console.log(`Toggling click-through mode. Current state: ${state.isClickThroughEnabled ? 'enabled' : 'disabled'}`);
  if (state.isClickThroughEnabled) {
    disableClickThrough();
  } else {
    enableClickThrough();
  }
}

// Add a function to check if click-through is enabled
function isClickThroughEnabled(): boolean {
  return state.isClickThroughEnabled;
}

// Export state and functions for other modules
export {
  state,
  createWindow,
  hideMainWindow,
  showMainWindow,
  toggleMainWindow,
  setWindowDimensions,
  moveWindowHorizontal,
  moveWindowVertical,
  getMainWindow,
  getView,
  setView,
  getScreenshotHelper,
  getProblemInfo,
  setProblemInfo,
  getScreenshotQueue,
  getExtraScreenshotQueue,
  clearQueues,
  takeScreenshot,
  getImagePreview,
  deleteScreenshot,
  setHasDebugged,
  getHasDebugged,
  enableClickThrough,
  disableClickThrough,
  toggleClickThrough,
  isClickThroughEnabled,
  moveToDisplay
}

// Make sure to hide from dock when app is ready
app.whenReady().then(() => {
  if (process.platform === "darwin") {
    try {
      app.dock.hide();
      console.log("App hidden from dock when ready");
    } catch (error) {
      console.error("Failed to hide from dock when ready:", error);
    }
  }
  initializeApp();
})
