export function LoadingScreen({ label = 'Carregando HBX SaaS...' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-orb" />
      <p>{label}</p>
    </div>
  )
}
