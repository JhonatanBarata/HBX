package br.com.hbxsystem.entrega

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

data class OperationalNetworkState(
    val validated: Boolean,
    val unmetered: Boolean,
)

object OperationalNetwork {
    fun current(context: Context): OperationalNetworkState {
        val manager = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return OperationalNetworkState(validated = false, unmetered = false)
        val network = manager.activeNetwork ?: return OperationalNetworkState(validated = false, unmetered = false)
        val capabilities = manager.getNetworkCapabilities(network)
            ?: return OperationalNetworkState(validated = false, unmetered = false)
        val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        val unmetered = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        return OperationalNetworkState(validated = validated, unmetered = unmetered)
    }
}
