import { defineCollection, z } from "astro:content";

const additveColletions = defineCollection({
  schema: ({ image }) => z.object({
    title: z.string(),
    description: z.string().optional(),
    cover: image().optional(),
  }),
});


export const collections = {
  'additive-products': additveColletions,
  'additive-processes': additveColletions
};