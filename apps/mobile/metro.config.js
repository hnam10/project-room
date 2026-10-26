// Monorepo: resolve @project-room/shared from packages/ and hoist deps from the repo root.
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const clerkExpoRoot = path.resolve(workspaceRoot, 'node_modules/@clerk/clerk-expo');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'expo-notifications': path.resolve(workspaceRoot, 'node_modules/expo-notifications'),
  'expo-device': path.resolve(workspaceRoot, 'node_modules/expo-device'),
  'expo-auth-session': path.resolve(workspaceRoot, 'node_modules/expo-auth-session'),
};
config.resolver.disableHierarchicalLookup = true;

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // API's @clerk/express hoists @clerk/shared@4; mobile Clerk SDKs need @clerk/shared@3.
  if (moduleName === '@clerk/shared' || moduleName.startsWith('@clerk/shared/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [clerkExpoRoot] }),
    };
  }

  if (moduleName === 'react' || moduleName === 'react-dom') {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return metroResolve(context, moduleName, platform);
};

module.exports = config;
