import { FastifyReply, FastifyRequest } from 'fastify';
import { googlereviewService } from '../services/googlereview.service.js';

export module googlereviewController {
    export async function getReviewsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const data = await googlereviewService.fetchGoogleReviews();
    return reply.send(data);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}
}

