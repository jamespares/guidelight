import PptxGenJS from 'pptxgenjs'
import type { LessonBatchRow, LessonRow, LessonStage } from '@/lib/api'
import { downloadBlob } from '@/lib/lessonExport'

// Brand palette (matches src/index.css navy/silver theme)
const NAVY = '131D34'
const INK = '1F2937'
const MUTED = '64748B'
const SILVER = 'C5CBD6'
const FONT = 'Calibri'

const MAX_BULLETS = 8

export function sanitizeFilename(name: string) {
  const safe = name
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return safe || 'lesson'
}

/** Split stage steps into per-slide chunks, dropping blank entries. */
export function chunkSteps(steps: string[], max = MAX_BULLETS): string[][] {
  const clean = steps.map((s) => s.trim()).filter(Boolean)
  if (!clean.length) return [[]]
  const chunks: string[][] = []
  for (let i = 0; i < clean.length; i += max) chunks.push(clean.slice(i, i + max))
  return chunks
}

function addFooter(slide: PptxGenJS.Slide, color = MUTED) {
  slide.addText('Guidelight', {
    x: 0.5,
    y: 5.22,
    w: 2,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color,
  })
}

function addSlideHeading(slide: PptxGenJS.Slide, text: string) {
  slide.addText(text, {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.6,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: NAVY,
  })
}

function addBullets(slide: PptxGenJS.Slide, items: string[]) {
  if (!items.length) {
    slide.addText('(No steps recorded)', {
      x: 0.6,
      y: 1.15,
      w: 8.8,
      h: 0.5,
      fontFace: FONT,
      fontSize: 14,
      italic: true,
      color: MUTED,
    })
    return
  }
  slide.addText(
    items.map((s) => ({ text: s, options: { bullet: true, breakLine: true } })),
    {
      x: 0.6,
      y: 1.15,
      w: 8.8,
      h: 3.9,
      fontFace: FONT,
      fontSize: 16,
      color: INK,
      paraSpaceAfter: 8,
      valign: 'top',
    },
  )
}

function addStageSlides(pptx: PptxGenJS, label: string, stage: LessonStage | undefined) {
  if (!stage) return
  const chunks = chunkSteps(stage.steps ?? [])
  chunks.forEach((steps, i) => {
    const slide = pptx.addSlide()
    addSlideHeading(
      slide,
      `${label}${i > 0 ? ' (cont.)' : ''} · ${stage.durationMins ?? '?'} min`,
    )
    addBullets(slide, steps)
    if (i === chunks.length - 1 && stage.teacherNotes) {
      slide.addText(`Teacher notes: ${stage.teacherNotes}`, {
        x: 0.6,
        y: 4.7,
        w: 8.8,
        h: 0.5,
        fontFace: FONT,
        fontSize: 11,
        italic: true,
        color: MUTED,
      })
    }
    addFooter(slide)
  })
}

export async function exportLessonPptx(batch: LessonBatchRow, lesson: LessonRow) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Guidelight'
  pptx.company = 'Guidelight'
  pptx.title = lesson.title

  const plan = lesson.plan

  // 1. Title slide
  const title = pptx.addSlide()
  title.background = { color: NAVY }
  title.addText(lesson.title || 'Lesson', {
    x: 0.6,
    y: 1.9,
    w: 8.8,
    h: 1.2,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: 'FFFFFF',
  })
  title.addText(
    [
      `${batch.class_name ?? 'Class'} · ${batch.subject}${batch.curriculum ? ` · ${batch.curriculum}` : ''}`,
      `${lesson.scheduled_date} (${lesson.day_of_week}) · Week ${lesson.week_index} · ${batch.duration_minutes} min`,
    ].join('\n'),
    {
      x: 0.6,
      y: 3.2,
      w: 8.8,
      h: 1,
      fontFace: FONT,
      fontSize: 16,
      color: SILVER,
      lineSpacing: 24,
    },
  )
  addFooter(title, SILVER)

  // 2. Learning objective + materials
  const overview = pptx.addSlide()
  addSlideHeading(overview, 'Learning objective')
  overview.addText(plan?.learningObjective || '(none)', {
    x: 0.6,
    y: 1.15,
    w: 8.8,
    h: 1.4,
    fontFace: FONT,
    fontSize: 16,
    color: INK,
    valign: 'top',
  })
  overview.addText('Materials', {
    x: 0.6,
    y: 2.7,
    w: 8.8,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: NAVY,
  })
  const materials = (plan?.materials ?? []).map((m) => m.trim()).filter(Boolean)
  overview.addText(
    materials.length
      ? materials.map((m) => ({ text: m, options: { bullet: true, breakLine: true } }))
      : '(none)',
    {
      x: 0.6,
      y: 3.2,
      w: 8.8,
      h: 1.8,
      fontFace: FONT,
      fontSize: 14,
      color: INK,
      paraSpaceAfter: 6,
      valign: 'top',
    },
  )
  addFooter(overview)

  // 3–5. One slide (or more, when steps overflow) per PPP stage
  addStageSlides(pptx, 'Presentation', plan?.presentation)
  addStageSlides(pptx, 'Practice', plan?.practice)
  addStageSlides(pptx, 'Production', plan?.production)

  // 6. Differentiation & plenary
  if (plan?.differentiation || plan?.plenary) {
    const slide = pptx.addSlide()
    addSlideHeading(slide, 'Differentiation & plenary')
    const blocks: { text: string; options: PptxGenJS.TextPropsOptions }[] = []
    if (plan.differentiation) {
      blocks.push(
        { text: 'Differentiation', options: { bold: true, color: NAVY, breakLine: true } },
        { text: plan.differentiation, options: { color: INK, breakLine: true } },
        { text: '', options: { breakLine: true } },
      )
    }
    if (plan.plenary) {
      blocks.push(
        { text: 'Plenary', options: { bold: true, color: NAVY, breakLine: true } },
        { text: plan.plenary, options: { color: INK, breakLine: true } },
      )
    }
    slide.addText(blocks, {
      x: 0.6,
      y: 1.15,
      w: 8.8,
      h: 3.9,
      fontFace: FONT,
      fontSize: 15,
      paraSpaceAfter: 6,
      valign: 'top',
    })
    addFooter(slide)
  }

  // 7. Homework
  if (plan?.homeworkOptional) {
    const slide = pptx.addSlide()
    addSlideHeading(slide, 'Homework (optional)')
    slide.addText(plan.homeworkOptional, {
      x: 0.6,
      y: 1.15,
      w: 8.8,
      h: 3.9,
      fontFace: FONT,
      fontSize: 16,
      color: INK,
      valign: 'top',
    })
    addFooter(slide)
  }

  const blob = await pptx.write({ outputType: 'blob' })
  downloadBlob(blob as Blob, `${sanitizeFilename(lesson.title || 'lesson')}.pptx`)
}
