package com.rezendepedro.CounG

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NetworkInfoModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "NetworkInfo"

  @ReactMethod
  fun getIpAddress(promise: Promise) {
    try {
      val wifiManager = reactContext.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager
      val ipAddress = wifiManager?.connectionInfo?.ipAddress ?: 0
      if (ipAddress == 0) {
        promise.resolve(null)
        return
      }
      promise.resolve(intToIp(ipAddress))
    } catch (error: Exception) {
      promise.reject("NETWORK_INFO_ERROR", error)
    }
  }

  private fun intToIp(ip: Int): String {
    return String.format(
      "%d.%d.%d.%d",
      ip and 0xff,
      ip shr 8 and 0xff,
      ip shr 16 and 0xff,
      ip shr 24 and 0xff
    )
  }
}
