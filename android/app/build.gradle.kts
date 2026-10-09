import groovy.json.JsonOutput

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Single URL source for BOTH apps. Keep the repository's web/ folder beside android/.
// Reading through a provider ensures config edits invalidate the build configuration.
val sharedConfig = providers.fileContents(rootProject.layout.projectDirectory.file("../web/js/config.js")).asText.get()
val chatGptUrl = Regex("""(?m)^\s*chatgptUrl:\s*"([^"\r\n]*)"\s*,?\s*$""")
    .find(sharedConfig)?.groupValues?.get(1)
    ?: error("Set a double-quoted chatgptUrl literal in web/js/config.js")
val voiceAppUrl = Regex("""(?m)^\s*voiceAppUrl:\s*"([^"\r\n]*)"\s*,?\s*$""")
    .find(sharedConfig)?.groupValues?.get(1) ?: ""

android {
    namespace = "com.viraj.aibuddy"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.viraj.aibuddy"
        minSdk = 23 // Fire OS 6+ (Android 7.1/API 25) and newer; no Google Play Services.
        targetSdk = 35
        versionCode = 2
        versionName = "0.2"
        buildConfigField("String", "CHATGPT_URL", JsonOutput.toJson(chatGptUrl))
        buildConfigField("String", "VOICE_APP_URL", JsonOutput.toJson(voiceAppUrl))
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
