import type { RequestHandler } from 'express';
import type { RouteParameters } from 'express-serve-static-core';
import { ZodObject, ZodRawShape, ZodSchema, z } from 'zod';
import { AppError } from './types/ErrorResponse';

export type EnhancedRequestHandler<
  Body extends Record<string, any> = Record<string, never>,
  Query extends Record<string, any> = Record<string, never>,
  ResBody = any,
  Params extends Record<string, any> = Record<string, never>,
> = RequestHandler<Params, ResBody, Body, Query> & { __zod_api: RouteSchema };

export type EndpointMethod =
  | 'head'
  | 'get'
  | 'post'
  | 'patch'
  | 'put'
  | 'update'
  | 'delete'
  | 'options';

const routeSchema = z.object({
  meta: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    deprecated: z.boolean().optional(),
    responseDescription: z.string().optional(),
    errorDescription: z.string().optional(),
  }),
  bodySchema: z.any().optional(),
  paramsSchema: z.any().optional(),
  querySchema: z.any().optional(),
  responseSchema: z.any().optional(),
  middleware: z.array(z.any()),
});

export type RouteSchema = z.infer<typeof routeSchema>;
export type RouteMetaSchema = RouteSchema['meta'];

export const validateBody = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'malformed'));
    }

    Object.assign(req.body, result.data);
    return next();
  };
};

export const validateQuery = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'malformed'));
    }

    Object.assign(req.query, result.data);
    return next();
  };
};

export const validateParams = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      return next(new AppError(400, 'malformed'));
    }

    Object.assign(req.params, result.data);
    return next();
  };
};

export const validateResponse = <T>(schema: ZodSchema<T>): RequestHandler => {
  return (_req, res, next) => {
    const original = res.json;

    const func = function (body: any) {
      const result = schema.safeParse(body);

      if (!result.success) {
        next(new AppError(500, 'endpoint sent malformed response'));
        return res;
      }

      return original.call(res, body);
    };

    res.json = func;

    next();
  };
};

export class EndpointBuilder<
  Path extends string = any,
  ReqBody extends Record<string, any> = Record<string, never>,
  Query extends Record<string, any> = Record<string, never>,
  ResBody = any,
  Params extends Record<string, any> = Record<string, never>,
> {
  private _meta?: RouteMetaSchema;

  private _bodySchema?: ZodSchema;

  private _paramsSchema?: ZodSchema;

  private _querySchema?: ZodSchema;

  private _responseSchema?: ZodSchema;

  private _middleware: RequestHandler[];

  private _handler?: RequestHandler<Params, ResBody, ReqBody, Query>;

  constructor() {
    this._middleware = [];
  }

  public build(): [
    ...RequestHandler[],
    EnhancedRequestHandler<ReqBody, Query, ResBody, Params>,
  ] {
    if (!this._handler)
      throw new Error('a route must have a handler function: ');

    if (!this._meta) throw new Error('a route must have meta info');

    const info: RouteSchema = {
      meta: this._meta,
      middleware: [] as RequestHandler[],
    };

    if (this._bodySchema) {
      info.middleware.push(validateBody(this._bodySchema));
      info.bodySchema = this._bodySchema;
    }
    if (this._querySchema) {
      info.middleware.push(validateQuery(this._querySchema));
      info.querySchema = this._querySchema;
    }
    if (this._paramsSchema) {
      info.middleware.push(validateParams(this._paramsSchema));
      info.paramsSchema = this._paramsSchema;
    }
    if (this._responseSchema) {
      info.middleware.push(validateResponse(this._responseSchema));
      info.responseSchema = this._responseSchema;
    }
    // add custom middleware after body and query middleware
    info.middleware.push(...this._middleware);

    const handler: EnhancedRequestHandler<ReqBody, Query, ResBody, Params> =
      this._handler as unknown as EnhancedRequestHandler<
        ReqBody,
        Query,
        ResBody,
        Params
      >;
    handler.__zod_api = info;

    return [...info.middleware, handler];
  }

  public meta(
    _meta: RouteMetaSchema,
  ): Omit<EndpointBuilder<Path, ReqBody, Query, ResBody, Params>, 'meta'> {
    if (this._meta)
      throw new Error(
        `route metadata is already defined: ${JSON.stringify(this._meta)}`,
      );
    this._meta = _meta;
    return this as Omit<
      EndpointBuilder<Path, ReqBody, Query, ResBody, Params>,
      'meta'
    >;
  }

  public requestBody<T extends ZodRawShape>(
    schema: ZodObject<T>,
  ): Omit<
    EndpointBuilder<Path, z.infer<typeof schema>, Query, ResBody, Params>,
    'requestBody'
  > {
    if (this._bodySchema)
      throw new Error(
        `request body schema is already defined: ${JSON.stringify(
          this._bodySchema,
        )}`,
      );
    this._bodySchema = schema;
    return this as unknown as Omit<
      EndpointBuilder<Path, z.infer<typeof schema>, Query, ResBody, Params>,
      'requestBody'
    >;
  }

  public query<T extends ZodRawShape>(
    schema: ZodObject<T>,
  ): Omit<
    EndpointBuilder<Path, ReqBody, z.infer<typeof schema>, ResBody, Params>,
    'query'
  > {
    if (this._querySchema)
      throw new Error(
        `query params schema is already defined: ${JSON.stringify(
          this._querySchema,
        )}`,
      );
    this._querySchema = schema;
    return this as unknown as Omit<
      EndpointBuilder<Path, ReqBody, z.infer<typeof schema>, ResBody, Params>,
      'query'
    >;
  }

  public params<T extends RouteParameters<Path>>(
    schema: ZodSchema<T>,
  ): Omit<
    EndpointBuilder<
      Path,
      ReqBody,
      Query,
      ResBody,
      z.infer<typeof schema> extends RouteParameters<Path>
        ? z.infer<typeof schema>
        : Record<string, never>
    >,
    'params'
  > {
    if (this._paramsSchema)
      throw new Error(
        `URL params schema is already defined: ${JSON.stringify(
          this._paramsSchema,
        )}`,
      );
    this._paramsSchema = schema;
    return this as unknown as Omit<
      EndpointBuilder<
        Path,
        ReqBody,
        Query,
        ResBody,
        z.infer<typeof schema> extends RouteParameters<Path>
          ? z.infer<typeof schema>
          : Record<string, never>
      >,
      'params'
    >;
  }

  public response<T>(
    schema: ZodSchema<T>,
  ): Omit<
    EndpointBuilder<Path, ReqBody, Query, z.infer<typeof schema>, Params>,
    'response'
  > {
    if (this._responseSchema)
      throw new Error(
        `response schema is already defined: ${JSON.stringify(
          this._responseSchema,
        )}`,
      );
    this._responseSchema = schema;
    return this as unknown as Omit<
      EndpointBuilder<Path, ReqBody, Query, z.infer<typeof schema>, Params>,
      'response'
    >;
  }

  public schema<
    B extends ZodRawShape,
    Q extends ZodRawShape,
    P extends RouteParameters<Path>,
    R,
  >(s: {
    requestBody: ZodObject<B>;
    query: ZodObject<Q>;
    params: ZodSchema<P>;
    response: ZodSchema<R>;
  }) {
    return this.requestBody(s.requestBody)
      .query(s.query)
      .response(s.response)
      .params(s.params);
  }

  public use(
    ...handlers: RequestHandler[]
  ): Omit<EndpointBuilder<Path, ReqBody, Query, ResBody, Params>, 'use'> {
    this._middleware.push(...handlers);
    return this;
  }

  public handle(
    handler: RequestHandler<Params, ResBody, ReqBody, Query>,
  ): Omit<EndpointBuilder<Path, ReqBody, Query, ResBody, Params>, 'handle'> {
    if (this._handler) {
      throw new Error(
        'A handler is already defined for this route. Utilize the use method to add additional handlers as middlewares',
      );
    }

    this._handler = handler;
    return this;
  }
}

export const decorate = <
  T extends string = '/',
  ReqBody extends Record<string, any> = Record<string, never>,
  ResBody = any,
  Query extends Record<string, any> = Record<string, never>,
>(
  handler?: RequestHandler<RouteParameters<T>, ResBody, ReqBody, Query>,
) => {
  const builder = new EndpointBuilder<
    T,
    ReqBody,
    Query,
    ResBody,
    RouteParameters<T>
  >();
  if (handler) builder.handle(handler);

  return builder;
};
