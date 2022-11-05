import { FastifyInstance } from "fastify";
import ShortUniqueId from "short-unique-id";
import { z } from 'zod';
import { prisma } from "../lib/prisma";
import { authenticate } from "../plugins/authenticate";

export async function pollRoutes(fastify: FastifyInstance) {
 
  fastify.get('/polls/count', async () => {
    const count = await prisma.pool.count()
    return { count }
  })
    
  fastify.post('/polls', async (request, reply) => {
    const createPollBody = z.object({
      title: z.string()
    })
    
    const { title } = createPollBody.parse(request.body)

    const generate = new ShortUniqueId({ length: 6 })
    const code = String(generate()).toUpperCase()

    try {
      await request.jwtVerify()
      await prisma.pool.create({
        data: {
          title,
          code,
          ownerId: request.user.sub,

          participants: {
            create: {
              userId: request.user.sub,
            }
          }
        }
      })
    } catch {
      await prisma.pool.create({
        data: {
          title,
          code,
        }
      })
    }

    
    return reply.status(201).send({ code: code }) 
  })

  fastify.post('/polls/join', { 
    onRequest: [authenticate] 
  }, async (request, reply) => {
    const joinPollBody = z.object({
      code: z.string().min(6)
    })

    const { code } = joinPollBody.parse(request.body)

    const poll = await prisma.pool.findUnique({
      where: {
        code
      },
      include: {
        participants: {
          where: {
            userId: request.user.sub
          }
        }
      }
    })

    if (!poll) {
      return reply.status(400).send({
        message: 'Poll not found.'
      })
    }
    
    if (poll.participants.length > 0) {
      return reply.status(400).send({
        message: 'You already joined thi poll.'
      })
    }

    if(!poll.ownerId) {
      await prisma.pool.update({
        where: {
          id: poll.id
        }, 
        data: {
          ownerId: request.user.sub
        }
      })
    }

    await prisma.participant.create({
      data: {
        poolId: poll.id,
        userId: request.user.sub
      }
    })

    return reply.status(201).send()

  })

  fastify.get('/polls', { 
    onRequest: [authenticate] 
  }, async (request, reply) => {
    const polls = await prisma.pool.findMany({
      where: {
        participants: {
          some: {
            userId: request.user.sub,
          }
        }
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        participants: {
          select: {
            id: true,
            
            user: {
              select: {
                avatarUrl: true
              }
            }
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    return {polls}
  })

  fastify.get('/polls/:id', { 
    onRequest: [authenticate] 
  }, async (request, reply) => {
    const getPollParams = z.object({
      id: z.string()
    })

    const { id } = getPollParams.parse(request.params)

    const poll = await prisma.pool.findUnique({
      where: {
       id
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        participants: {
          select: {
            id: true,
            
            user: {
              select: {
                avatarUrl: true
              }
            }
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    return { poll }
  })

}

