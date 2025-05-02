#!/bin/bash

# This script helps create a GitHub Release with the updated DMG packages
# You'll need to have the GitHub CLI (gh) installed: https://cli.github.com/

echo "Creating GitHub Release for Interview Coder Blue"
echo ""
echo "Before continuing, make sure you:"
echo "1. Have the GitHub CLI (gh) installed"
echo "2. Are authenticated with GitHub (run 'gh auth login')"
echo ""
echo "The release will include the macOS packages with a completely new blue icon."
echo "This version uses a completely different application ID and name to avoid any icon caching issues."
echo "The app will appear as 'Interview Coder Blue' in your Applications folder."
echo ""

read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create the release
echo "Creating GitHub Release..."
gh release create v1.0.20-blue-icon \
  --title "v1.0.20 - Interview Coder Blue" \
  --notes "This release contains a completely different version of the Interview Coder application with a simple blue icon. It uses a different application ID and name to avoid any macOS icon caching issues. **IMPORTANT:** This app will install as 'Interview Coder Blue' and can be installed alongside the original app." \
  "../blue_version/Interview-Coder-x64.dmg#Interview Coder Blue for macOS (Intel)" \
  "../blue_version/Interview-Coder-arm64.dmg#Interview Coder Blue for macOS (Apple Silicon)"

echo ""
echo "If the command was successful, the release is now available on GitHub."
echo "Check the releases page at: https://github.com/FactualTechAthereusUS/cloned-Interview-coder-/releases"
