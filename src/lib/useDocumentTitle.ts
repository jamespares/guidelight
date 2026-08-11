import { useEffect } from 'react'
import { DEFAULT_TITLE } from '@/lib/seo'

/**
 * Set document.title for client-side navigation. The prerendered HTML already
 * carries the right title per route — this keeps it correct when the SPA
 * navigates without a full page load. Restores the site default on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])
}
