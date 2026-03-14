export function formatDate(dateIso: string | null) {
  if (!dateIso) {
    return 'Nao definido'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateIso))
}

export function formatRelativeTime(targetDateIso: string) {
  const diffMs = new Date(targetDateIso).getTime() - Date.now()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))

  const days = Math.floor(diffMinutes / (60 * 24))
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60)
  const minutes = diffMinutes % 60

  if (days > 0) {
    return `${days} dia${days === 1 ? '' : 's'}`
  }

  if (hours > 0) {
    return `${hours} hora${hours === 1 ? '' : 's'}`
  }

  return `${minutes} min`
}
