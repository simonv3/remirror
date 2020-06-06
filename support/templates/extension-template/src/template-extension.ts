import {
  CustomHandlerKeyList,
  DefaultExtensionOptions,
  HandlerKeyList,
  PlainExtension,
  StaticKeyList,
} from '@remirror/core';

export interface TemplateOptions {}

/**
 * An extension for the remirror editor. CHANGE ME.
 */
export class TemplateExtension extends PlainExtension<TemplateOptions> {
  public static readonly staticKeys: StaticKeyList<TemplateOptions> = [];
  public static readonly handlerKeys: HandlerKeyList<TemplateOptions> = [];
  public static readonly customHandlerKeys: CustomHandlerKeyList<TemplateOptions> = [];

  public static readonly defaultOptions: DefaultExtensionOptions<TemplateOptions> = {};

  get name() {
    return 'template' as const;
  }
}
