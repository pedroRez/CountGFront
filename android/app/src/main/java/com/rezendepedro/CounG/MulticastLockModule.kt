package com.rezendepedro.CounG

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MulticastLockModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun getName(): String = "MulticastLock"

  @ReactMethod
  fun acquire(promise: Promise) {
    try {
      val wifiManager = reactContext.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager
      if (wifiManager == null) {
        promise.resolve(false)
        return
      }

      if (multicastLock == null) {
        multicastLock = wifiManager.createMulticastLock("CountGMulticastLock").apply {
          setReferenceCounted(false)
        }
      }

      if (multicastLock?.isHeld != true) {
        multicastLock?.acquire()
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("MULTICAST_LOCK_ERROR", error)
    }
  }

  @ReactMethod
  fun release(promise: Promise) {
    try {
      if (multicastLock?.isHeld == true) {
        multicastLock?.release()
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("MULTICAST_LOCK_ERROR", error)
    }
  }
}
