'use client'

import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { ko } from 'react-day-picker/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type DateAndTimePickerProps = {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
}

export function DateAndTimePicker ({
  date, onDateChange,
}: DateAndTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const onDateChangeInternal = (newDate: Date | undefined) => {
    if (!newDate) {
      onDateChange(undefined)
      return
    }

    if (date) {
      newDate.setHours(
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
      )
    }

    onDateChange(newDate)
  }

  const onTimeChange = (timeString: string) => {
    if (!date) {
      return
    }

    const [hours, minutes, seconds] = timeString.split(':').map(Number)
    const newDate = new Date(date)
    newDate.setHours(hours, minutes, seconds)
    onDateChange(newDate)
  }

  const time = date
    ? date.toTimeString().split(' ')[0]
    : '10:30:00'

  return (
    <div className='flex gap-4'>
      <div className='flex flex-col gap-3'>
        <Label htmlFor='date-picker' className='px-1'>
          날짜
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              id='date-picker'
              className='w-32 justify-between font-normal'
            >
              {date ? date.toLocaleDateString('ko-KR') : '날짜 선택'}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
            <Calendar
              locale={ko}
              mode='single'
              selected={date}
              captionLayout='dropdown'
              onSelect={(date) => {
                onDateChangeInternal(date)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className='flex flex-col gap-3'>
        <Label htmlFor='time-picker' className='px-1'>
          시간
        </Label>
        <Input
          type='time'
          id='time-picker'
          step='1'
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className='bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none'
        />
      </div>
    </div>
  )
}
