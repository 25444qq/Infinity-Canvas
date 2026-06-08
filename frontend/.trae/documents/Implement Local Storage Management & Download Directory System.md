I will implement a comprehensive **Local Storage & Memory Management System** that works within your current web environment while preparing for future EXE packaging.

### 1. New Service: `storageService.ts`
I will create a dedicated service to handle file system operations using the modern **File System Access API**.
- **Features**:
  - **Directory Picker**: Allows users to select a folder on their computer.
  - **Handle Persistence**: Stores the directory permission in IndexedDB (browser database) so it remembers the selection after refresh.
  - **Smart Saving**:
    - Attempts to save directly to the selected folder.
    - **Fallback Protection**: If no folder is set or permission is denied, it gracefully falls back to the standard browser download method (ensuring no functionality is broken).
  - **Memory Management**:
    - **Quota Monitoring**: Checks how much browser storage space is being used.
    - **Cleanup Tools**: Functions to clear cache and reset configurations.

### 2. Update Settings UI (`SettingsModal.tsx`)
I will add a new **"Storage & Local"** tab to the Settings menu.
- **Download Settings**:
  - A button to "Set Download Directory".
  - Status display showing the currently selected folder name.
- **Memory Manager**:
  - A visual progress bar showing Storage Usage (Used vs. Available).
  - A "Clear Cache / Reset" button to help manage local resources.

### 3. Integrate with Download Logic (`App.tsx`)
I will upgrade the existing `handleDownload` function.
- **Workflow**:
  1. User clicks download.
  2. System checks if a "Target Directory" is set.
  3. **If Set**: Saves the file directly to that folder without a prompt (after initial permission).
  4. **If Not Set**: Uses the current method (browser download prompt).
- This ensures a seamless transition to a "Desktop App" feel while maintaining web compatibility.

### 4. Verification
- Verify that setting a directory works and persists.
- Verify that files are saved to the correct location.
- Verify that "Clear Cache" works correctly.
- Ensure existing download functionality remains untouched as a fallback.