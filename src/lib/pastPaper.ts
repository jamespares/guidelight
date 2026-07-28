/** Client-side past-paper file helpers: PDF text extraction + image data URLs. */

export async function readPastPaperFile(file: File): Promise<{
  text?: string
  imageDataUrl?: string
  fileName: string
}> {
  const name = file.name
  const type = file.type || ''

  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    const imageDataUrl = await fileToDataUrl(file)
    return { imageDataUrl, fileName: name }
  }

  if (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    const text = await extractPdfText(file)
    return { text, fileName: name }
  }

  throw new Error('Please upload a PDF or image (PNG, JPG, WebP).')
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const maxPages = Math.min(doc.numPages, 12)
  const chunks: string[] = []

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    if (line.trim()) chunks.push(`--- Page ${pageNum} ---\n${line}`)
  }

  const text = chunks.join('\n\n').trim()
  if (!text) {
    throw new Error(
      'Could not extract text from this PDF (it may be scanned). Try uploading a clear image instead.',
    )
  }
  return text.slice(0, 40000)
}
