import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
} from 'docx'
import type { LessonBatchRow, LessonRow, LessonStage } from '@/lib/api'
import { activityStyleLabel } from '@/lib/lessonLabels'

function stageLines(label: string, stage: LessonStage | undefined): string[] {
  if (!stage) return [`${label}: (empty)`]
  const steps = (stage.steps ?? []).map((s, i) => `  ${i + 1}. ${s}`)
  return [
    `${label} (${stage.durationMins ?? '?'} min)`,
    ...steps,
    stage.teacherNotes ? `  Notes: ${stage.teacherNotes}` : '',
  ].filter(Boolean)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportLessonBatchCsv(batch: LessonBatchRow, lessons: LessonRow[]) {
  const header = [
    'date',
    'day',
    'week',
    'title',
    'activity_style',
    'career_context',
    'learning_objective',
    'presentation',
    'practice',
    'production',
  ]
  const rows = lessons.map((l) => {
    const p = l.plan
    return [
      l.scheduled_date,
      l.day_of_week,
      String(l.week_index),
      `"${(l.title || '').replace(/"/g, '""')}"`,
      activityStyleLabel(p?.activityStyle),
      `"${(p?.careerContext || '').replace(/"/g, '""')}"`,
      `"${(p?.learningObjective || '').replace(/"/g, '""')}"`,
      `"${(p?.presentation?.steps ?? []).join('; ').replace(/"/g, '""')}"`,
      `"${(p?.practice?.steps ?? []).join('; ').replace(/"/g, '""')}"`,
      `"${(p?.production?.steps ?? []).join('; ').replace(/"/g, '""')}"`,
    ].join(',')
  })
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const safe = (batch.title || 'lessons').replace(/[^\w-]+/g, '_').slice(0, 40)
  downloadBlob(blob, `${safe}.csv`)
}

export async function exportLessonBatchDocx(batch: LessonBatchRow, lessons: LessonRow[]) {
  const children: Paragraph[] = [
    new Paragraph({
      text: batch.title || `${batch.subject} lesson plan`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${batch.class_name ?? 'Class'} · ${batch.subject} · ${batch.curriculum || 'Curriculum n/a'} · Ages ${batch.age_range || 'n/a'}`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(
          `${batch.weeks} weeks · ${batch.duration_minutes} min · ${batch.days_of_week.join(', ')} · from ${batch.start_date}`,
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(`Resources: ${(batch.resources ?? []).join(', ') || 'n/a'}`),
      ],
    }),
    new Paragraph({ text: '' }),
  ]

  for (const lesson of lessons) {
    const p = lesson.plan
    children.push(
      new Paragraph({
        text: `${lesson.scheduled_date} (${lesson.day_of_week}) — ${lesson.title}`,
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Week ${lesson.week_index} · ${activityStyleLabel(p?.activityStyle)}${
              p?.careerContext ? ` · ${p.careerContext}` : ''
            }`,
            italics: true,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Objective: ', bold: true }),
          new TextRun(p?.learningObjective || ''),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Materials: ', bold: true }),
          new TextRun((p?.materials ?? []).join(', ') || 'n/a'),
        ],
      }),
    )

    for (const [label, stage] of [
      ['Presentation', p?.presentation],
      ['Practice', p?.practice],
      ['Production', p?.production],
    ] as const) {
      children.push(
        new Paragraph({
          text: label,
          heading: HeadingLevel.HEADING_2,
        }),
      )
      for (const line of stageLines(label, stage)) {
        if (line.startsWith(label)) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: line, bold: true })],
            }),
          )
        } else {
          children.push(new Paragraph({ text: line.trim() }))
        }
      }
    }

    if (p?.differentiation) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Differentiation: ', bold: true }),
            new TextRun(p.differentiation),
          ],
        }),
      )
    }
    if (p?.plenary) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Plenary: ', bold: true }),
            new TextRun(p.plenary),
          ],
        }),
      )
    }
    if (p?.homeworkOptional) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Homework: ', bold: true }),
            new TextRun(p.homeworkOptional),
          ],
        }),
      )
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length
          ? children
          : [new Paragraph({ text: 'No lessons', alignment: AlignmentType.LEFT })],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const safe = (batch.title || 'lessons').replace(/[^\w-]+/g, '_').slice(0, 40)
  downloadBlob(blob, `${safe}.docx`)
}
