const pkg = require("./package.json");
const appVariant = process.env.APP_VARIANT ?? "production";

const variants = {
  production: {
    name: "Paseo",
    packageId: "sh.paseo",
    googleServicesFile: "./.secrets/google-services.prod.json",
    googleServiceInfoPlist: "./.secrets/GoogleService-Info.prod.plist",
  },
  development: {
    name: "Paseo Debug",
    packageId: "sh.paseo.debug",
    googleServicesFile: "./.secrets/google-services.debug.json",
    googleServiceInfoPlist: "./.secrets/GoogleService-Info.debug.plist",
  },
};

const variant = variants[appVariant] ?? variants.production;

export default {
  expo: {
    name: variant.name,
    slug: "voice-mobile",
    version: pkg.version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "paseo",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/0e7f65ce-0367-46c8-a238-2b65963d235a",
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSMicrophoneUsageDescription:
          "This app needs access to the microphone for voice commands.",
        ITSAppUsesNonExemptEncryption: false,
      },
      bundleIdentifier: variant.packageId,
      googleServicesFile: variant.googleServiceInfoPlist,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      // Allow HTTP connections for local network hosts (required for release builds)
      usesCleartextTraffic: true,
      permissions: [
        "RECORD_AUDIO",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "CAMERA",
        "android.permission.CAMERA",
      ],
      package: variant.packageId,
      googleServicesFile: variant.googleServicesFile,
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-camera",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan pairing QR codes.",
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#20744A",
        },
      ],
      "expo-audio",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 29,
            kotlinVersion: "2.1.20",
            // Allow HTTP connections for local network hosts in release builds
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "0e7f65ce-0367-46c8-a238-2b65963d235a",
      },
    },
    owner: "getpaseo",
  },
};
