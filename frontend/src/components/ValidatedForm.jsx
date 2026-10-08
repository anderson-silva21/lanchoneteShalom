import { useContext, useEffect, useId, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { FormContext } from './formContext'
import { fieldError, serverFieldErrors, validateForm } from '../utils/formValidation'

function focusFirst(form, nextErrors, scrollToError) {
  const field = Array.from(form.elements).find((field) => nextErrors[field.id])
  field?.focus()
  if (scrollToError) field?.scrollIntoView({ block: 'center' })
}

export function ValidatedForm({ children, onSubmit, ref, scrollToError = false, ...props }) {
  const formRef = useRef(null)
  const attemptedRef = useRef(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    const form = formRef.current
    function handleServerError(event) {
      attemptedRef.current = true
      const nextErrors = serverFieldErrors(form, event.detail)
      setErrors(nextErrors)
      focusFirst(form, nextErrors, scrollToError)
    }
    form.addEventListener('form-error', handleServerError)
    return () => form.removeEventListener('form-error', handleServerError)
  }, [scrollToError])

  function revalidate(event) {
    const form = event.currentTarget
    const changedField = event.target
    queueMicrotask(() => {
      if (formRef.current !== form || !form.contains(changedField)) return
      setErrors((current) => {
        const next = { ...current }
        for (const field of Array.from(form.elements)) {
          if (attemptedRef.current && field.id && (field === changedField || field.dataset.match === changedField.name)) {
            const message = fieldError(field, form)
            if (message) next[field.id] = message
            else delete next[field.id]
          }
        }
        return next
      })
    })
  }

  function submit(event) {
    attemptedRef.current = true
    const form = event.currentTarget
    const nextErrors = validateForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      event.preventDefault()
      focusFirst(form, nextErrors, scrollToError)
      return
    }
    onSubmit?.(event)
  }

  return (
    <FormContext.Provider value={errors}>
      <form {...props} ref={(node) => {
        formRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }} noValidate onSubmit={submit} onChangeCapture={revalidate}>
        {children}
      </form>
    </FormContext.Provider>
  )
}

export function FormControl({ as: Tag = 'input', unframed = false, className = '', ...props }) {
  const generatedId = useId()
  const id = props.id || generatedId
  const errors = useContext(FormContext)
  const message = props.disabled ? '' : errors[id]
  const description = [props['aria-describedby'], message ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const wrapped = !unframed && !['checkbox', 'radio', 'hidden'].includes(props.type)
  const layoutPattern = /(^|:)(col-|row-|w-|min-w-|max-w-|flex-|shrink-|grow|self-|mt-|mb-|mx-|my-)/
  const classes = className.split(/\s+/)
  const layoutClasses = classes.filter((token) => layoutPattern.test(token)).join(' ')
  const controlClasses = wrapped ? `${classes.filter((token) => !layoutPattern.test(token)).join(' ')} w-full` : className
  const control = <>
    <Tag {...props} id={id} className={controlClasses} aria-invalid={message ? true : undefined} aria-describedby={description} />
    {message ? <span id={`${id}-error`} className="form-field-error" role="alert"><CircleAlert size={15} aria-hidden="true" /><span>{message}</span></span> : null}
  </>
  if (!wrapped) return control
  return <div className={`min-w-0 ${layoutClasses}`}>{control}</div>
}
