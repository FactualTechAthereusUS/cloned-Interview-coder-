#!/bin/bash

# This script helps create a GitHub Release with the updated DMG packages
# You'll need to have the GitHub CLI (gh) installed: https://cli.github.com/

echo "Creating GitHub Release for Interview Coder with updated icons"
echo ""
echo "Before continuing, make sure you:"
echo "1. Have the GitHub CLI (gh) installed"
echo "2. Are authenticated with GitHub (run 'gh auth login')"
echo ""
echo "The release will include the macOS packages with original icons."
echo ""

read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create the release
echo "Creating GitHub Release..."
gh release create v1.0.20-icons \
  --title "v1.0.20 - Restored Original Icons" \
  --notes "This release contains the Interview Coder application packages with the original icons restored. The Eye of Providence icon has been removed." \
  "release-packages/Interview-Coder-x64.dmg#Interview Coder for macOS (Intel)" \
  "release-packages/Interview-Coder-arm64.dmg#Interview Coder for macOS (Apple Silicon)"

echo ""
echo "If the command was successful, the release is now available on GitHub."
echo "Check the releases page at: https://github.com/FactualTechAthereusUS/cloned-Interview-coder-/releases"
