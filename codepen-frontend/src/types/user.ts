export interface User {
  user_id: string
  username: string
  email: string
  role: 'student' | 'professor'
  created_at: string
  position: null | string
  department: null | string
  office: null | string
  student_no: null | number
  grade: null | number
  major: null | string
  codepen_username: null | string
}
