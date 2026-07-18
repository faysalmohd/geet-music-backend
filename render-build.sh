#!/usr/bin/env bash
# exit on error
set -o errexit

# Install deno
curl -fsSL https://deno.land/install.sh | sh

# Add deno to PATH
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

# Install Node dependencies
npm install