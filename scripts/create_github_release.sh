#!/bin/bash

# This script helps create a GitHub Release with the updated DMG packages
# You'll need to have the GitHub CLI (gh) installed: https://cli.github.com/

echo "Creating GitHub Release for Interview Coder with original icons"
echo ""
echo "Before continuing, make sure you:"
echo "1. Have the GitHub CLI (gh) installed"
echo "2. Are authenticated with GitHub (run 'gh auth login')"
echo ""
echo "The release will include the macOS packages with the original icons."
echo "The Eye of Providence icon has been completely removed from all parts of the application."
echo "These packages use a new application ID (com.chunginlee.interviewcoder.original) to avoid icon caching issues."
echo ""

read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create the release
echo "Creating GitHub Release..."
gh release create v1.0.20-original-icons-fixed \
  --title "v1.0.20 - Original Icons Fully Restored" \
  --notes "This release contains the Interview Coder application packages with the original icons completely restored. All traces of the Eye of Providence icon have been removed from the application. **IMPORTANT:** These packages use a new application ID to avoid icon caching issues with macOS." \
  "../final_fixed_packages/Interview-Coder-x64.dmg#Interview Coder for macOS (Intel)" \
  "../final_fixed_packages/Interview-Coder-arm64.dmg#Interview Coder for macOS (Apple Silicon)"

echo ""
echo "If the command was successful, the release is now available on GitHub."
echo "Check the releases page at: https://github.com/FactualTechAthereusUS/cloned-Interview-coder-/releases"
