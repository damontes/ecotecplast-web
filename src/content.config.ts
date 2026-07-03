import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const additiveCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/additive-products' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      cover: image().optional(),
      layout: z.string().optional(),
      image: z.string().optional()
    })
})

const additiveProcessesCollection = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/additive-processes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      cover: image().optional(),
      layout: z.string().optional(),
      image: z.string().optional()
    })
})

export const collections = {
  'additive-products': additiveCollection,
  'additive-processes': additiveProcessesCollection
}
