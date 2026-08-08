export default function handler(_req, res) {
  return res.status(410).json({ error: 'Il proxy raw è disabilitato per proteggere i dati bancari.' })
}
