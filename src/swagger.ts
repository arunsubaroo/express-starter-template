import { type Express } from 'express';
import { oas30 } from 'openapi3-ts';
import { ZodObject, ZodRawShape, z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { EndpointMethod, EnhancedRequestHandler, RouteSchema } from './zod';

// 'split' and 'print' as 'getRouteMeta' copied and slightly modified from stack overflow to traverse the express routes.
// source: https://stackoverflow.com/a/46397967

function split(thing: any) {
  if (typeof thing === 'string') {
    return thing.split('/');
  } else if (thing.fast_slash) {
    return '';
  } else {
    const match = thing
      .toString()
      .replace('\\/?', '')
      .replace('(?=\\/|$)', '$')
      .match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//);
    return match
      ? match[1].replace(/\\(.)/g, '$1').split('/')
      : '<complex:' + thing.toString() + '>';
  }
}

function getRouteMeta(path: any, layer: any): RouteInfo | null {
  if (layer.route) {
    return layer.route.stack.map(
      getRouteMeta.bind(null, path.concat(split(layer.route.path))),
    );
  } else if (layer.name === 'router' && layer.handle.stack) {
    return layer.handle.stack.map(
      getRouteMeta.bind(null, path.concat(split(layer.regexp))),
    );
  } else if (layer.method && !!layer?.handle?.__zod_api) {
    return {
      method: layer.method,
      path: path.concat(split(layer.regexp)).filter(Boolean).join('/'),
      handle: layer.handle,
      info: layer.handle.__zod_api,
    };
  }

  return null;
}

type RouteInfo = {
  method: EndpointMethod;
  path: string;
  handle: EnhancedRequestHandler;
  info: RouteSchema;
};

function listAllRoutes(app: Express): RouteInfo[] {
  return app._router.stack
    .map(getRouteMeta.bind(null, []))
    .flat(process.env.ROUTE_LISTING_MAX_FLATTEN_DEPTH ?? 10)
    .filter(Boolean);
}

export function zodSchemaToOpenApiParams<T extends ZodRawShape>(
  _in: oas30.ParameterLocation,
  schema: ZodObject<T>,
) {
  if (!schema) return [];

  const arr: oas30.ParameterObject[] = [];

  const keys = Object.keys(schema.keyof().Values);

  for (const key of keys) {
    arr.push({
      in: _in,
      name: key,
      schema: zodToJsonSchema(schema.shape[key]) as any,
      required: !schema.shape[key].isOptional(),
    });
  }

  return arr;
}

export function generateDocumentation(app: Express, info?: oas30.InfoObject) {
  const doc = new oas30.OpenApiBuilder();

  doc.addInfo(info ?? { title: 'API', version: '0.0.1' });

  const routes = listAllRoutes(app);

  for (const route of routes) {
    const item: oas30.PathItemObject = {};

    const op: oas30.OperationObject = {
      summary: route.info?.meta.title,
      description: route.info?.meta.description,
      tags: route.info?.meta.tags,
      deprecated: route.info.meta.deprecated,
      parameters: [
        ...zodSchemaToOpenApiParams('query', route.info.querySchema),
        ...zodSchemaToOpenApiParams('path', route.info.paramsSchema),
      ],
      requestBody: route.info.bodySchema
        ? {
            content: {
              'application/json': {
                schema: zodToJsonSchema(
                  route.info?.bodySchema ?? z.any(),
                ) as any,
              },
            },
          }
        : undefined,
      responses: {
        '200': {
          description: route.info.meta.responseDescription,
          content: route.info.responseSchema
            ? {
                'application/json': {
                  schema: zodToJsonSchema(
                    route.info?.responseSchema ?? z.any(),
                  ) as any,
                },
              }
            : undefined,
        },
        '400': {
          description: route.info.meta.errorDescription,
          content: {
            'application/json': {
              schema: zodToJsonSchema(z.object({ error: z.string() })),
            },
          },
        },
      },
    };

    (item as any)[route.method] = op;
    doc.addPath('/' + route.path, item);
  }

  return doc;
}
