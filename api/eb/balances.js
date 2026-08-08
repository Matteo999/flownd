export default function handler(_req, res) {
  return res.status(410).json({ error: 'Usa la sincronizzazione Open Banking protetta.' })
}
