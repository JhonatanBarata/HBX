package br.com.hbxsystem.entrega

/** Uma parada da rota, espelhando o JSON que o web manda via HBXShell.setRota. */
data class Parada(
    val id: String,
    val nome: String,
    val lat: Double,
    val lng: Double
)
