#!/bin/bash

# Setup GitHub repository for the custom interview-coder application
# Replace YOUR_USERNAME with your actual GitHub username

echo "Setting up GitHub repository for custom interview-coder..."

# Check if username is provided
if [ "$1" == "" ]; then
  echo "Please provide your GitHub username as the first argument"
  echo "Usage: ./setup-github.sh YOUR_USERNAME [REPO_NAME]"
  exit 1
fi

USERNAME=$1
REPO_NAME=${2:-"interview-coder-custom"}

echo "Using GitHub username: $USERNAME"
echo "Repository name: $REPO_NAME"

# Add GitHub as remote origin
git remote add origin "git@github.com:$USERNAME/$REPO_NAME.git"
git branch -M main

echo "GitHub remote added. You can now push your code with:"
echo "git push -u origin main"

echo ""
echo "Make sure you have already created the repository at:"
echo "https://github.com/$USERNAME/$REPO_NAME"
echo ""
echo "If you haven't created it yet, go to GitHub, create a new empty repository,"
echo "then run the push command above." 