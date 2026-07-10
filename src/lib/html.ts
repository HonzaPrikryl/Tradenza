// Treat rich-text (RichTextEditor) content as empty when it has no visible text
// and no image — an editor left untouched still emits markup like `<p><br></p>`.
export function isEmptyHtml(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim() === '' && !/<img/i.test(html)
  )
}
