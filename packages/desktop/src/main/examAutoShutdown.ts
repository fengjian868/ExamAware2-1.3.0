import { exec } from 'child_process'
import { parseDateTime } from '@dsz-examaware/core'
import type { ExamConfig, ExamInfo } from '@dsz-examaware/core'

export function checkAndShutdown(config: ExamConfig | null, endedExam: ExamInfo | null): boolean {
  if (!config?.examInfos || !endedExam) return false

  const now = Date.now()
  const endHour = parseDateTime(endedExam.end).getHours()

  // Determine period: morning 5-12, afternoon 12-18, evening 18-5
  const period =
    endHour >= 5 && endHour < 12
      ? 'morning'
      : endHour >= 12 && endHour < 18
        ? 'afternoon'
        : 'evening'

  // Check if there are more exams in the same period that haven't ended
  const hasMoreInPeriod = config.examInfos.some((exam) => {
    const examEnd = parseDateTime(exam.end).getTime()
    const examEndHour = parseDateTime(exam.end).getHours()
    const examPeriod =
      examEndHour >= 5 && examEndHour < 12
        ? 'morning'
        : examEndHour >= 12 && examEndHour < 18
          ? 'afternoon'
          : 'evening'
    return examPeriod === period && examEnd > now
  })

  if (!hasMoreInPeriod) {
    // Last exam of the period - shutdown
    if (process.platform === 'win32') {
      exec('shutdown /s /t 60 /c "考试已全部结束，系统将在60秒后关机"')
    } else if (process.platform === 'linux') {
      exec('shutdown +1 "考试已全部结束，系统将在1分钟后关机"')
    } else if (process.platform === 'darwin') {
      exec('sudo shutdown -h +1')
    }
    return true
  }
  return false
}
