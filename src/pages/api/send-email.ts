import { CATEGORY } from '@/const'
import { sendEmail } from '@/lib/resend'
import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const category = url.searchParams.get('category') ?? CATEGORY.REQUEST_CONTACT
  const product = url.searchParams.get('product')

  const data = await request.formData()
  const values = Object.fromEntries(data.entries())

  try {
    await sendEmail({
      category,
      payload: values,
      product
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'El correo se envió correctamente!'
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error?.message
      }),
      {
        status: error.code
      }
    )
  }
}
