import { CATEGORY, PRODUCT_NAME, LABEL_NAME } from '@/const'
import { Resend } from 'resend'

interface SendEmailParams {
  category: string
  payload: Record<string, FormDataEntryValue>
  product: string | null
}

export const sendEmail = async ({
  category,
  product,
  payload
}: SendEmailParams) => {
  const resend = new Resend(import.meta.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'Ecotecplast <no-reply@ecotecplast.mx>',
    to: ['mmontes@ecotecplast.com'],
    subject:
      category === CATEGORY.REQUEST_SAMPLE
        ? 'Solicitud de muestra'
        : 'Contacto',
    html: `
        <div>
            ${
              category === CATEGORY.REQUEST_SAMPLE && product
                ? `<p>Esta es una solicitud de muestra para el producto <b>${PRODUCT_NAME[product]}</b></p>`
                : '<p>Solicitud de contacto</p>'
            }
            <h3>Información adicional</h3>
            <ul>
                ${Object.entries(payload)
                  .map(
                    ([key, value]) =>
                      `<li style="padding-top: 6px; padding-bottom: 6px;"><b>${LABEL_NAME[key]}</b>: ${value}</li>`
                  )
                  .join('')}
            </ul>
        </div>
    `,
    tags: [
      {
        name: 'category',
        value: category
      }
    ]
  })
}
