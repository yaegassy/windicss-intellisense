import { workspace } from 'vscode';
import { resolve } from 'path';
import { Processor } from 'windicss/lib';
import { flatColors, hex2RGB, highlightCSS } from '../utils';
import { utilities as dynamic, negative } from '../utils/utilities';
import { registerTS } from 'sucrase/dist/register';
import type { Core } from '../interfaces';

export async function init():Promise<Core> {
  try {
    const files = await workspace.findFiles('{tailwind,windi}.config.{js,cjs,ts}', '**​/node_modules/**');
    let configFile;
    let config;
    if (files[0]) {
      configFile = files[0].fsPath;
      if (configFile.endsWith('.ts')) {
        registerTS();
        const mod = require(configFile);
        if (mod.default) config = mod.default;
      } else {
        config = require(resolve(configFile));
      }
      console.log(`Loading Config File: ${configFile}`);
    }
    const processor = new Processor(config);
    const colors = flatColors(processor.theme('colors') as {[key:string]:string|{[key:string]:string}});
    const variants = processor.resolveVariants();
    const staticUtilities = processor.resolveStaticUtilities(true);

    const variantCompletions = Object.keys(variants).map(variant => {
      const style = variants[variant]();
      style.selector = '&';
      return {
        label: variant + ':',
        documentation: highlightCSS(style.build().replace('{\n  & {}\n}', '{\n  ...\n}').replace('{}', '{\n  ...\n}')),
      };
    });

    let staticCompletions = Object.keys(staticUtilities);
    const colorCompletions: {label: string, detail: string, documentation: string}[] = [];
    const dynamicCompletions: {label: string, position: number}[] = [];

    for (const [config, list] of Object.entries(dynamic)) {
      list.forEach(utility => {
        const mark = utility.search(/\$/);
        if (mark === -1) {
          staticCompletions.push(utility);
        } else {
          const prefix = utility.slice(0, mark-1);
          const suffix = utility.slice(mark);
          switch(suffix) {
          case '${static}':
            const staticConfig = Object.keys(processor.theme(config, {}) as any);
            const complections = staticConfig.map(i => i === 'DEFAULT'? prefix : i.charAt(0) === '-' ? `-${prefix}${i}` : `${prefix}-${i}`);
            // if (config in negative) complections = complections.concat(complections.map(i => `-${i}`));
            staticCompletions = staticCompletions.concat(complections);
            break;
          case '${color}':
            const colorConfig = flatColors(processor.theme(config, colors) as any);
            for (const [k, v] of Object.entries(colorConfig)) {
              const name = `${prefix}-${k}`;
              colorCompletions.push({
                label: name,
                detail: processor.interpret(name).styleSheet.build(),
                documentation: ['transparent', 'currentColor'].includes(v) ? v: `rgb(${hex2RGB(v)?.join(', ')})`,
              });
            }
            break;
          default:
            dynamicCompletions.push({
              label: utility,
              position: utility.length - mark,
            });
            if (config in negative) {
              dynamicCompletions.push({
                label: `-${utility}`,
                position: utility.length + 1 - mark,
              });
            }
            break;
          }
        }
      });
    }

    return {
      processor,
      colors,
      variantCompletions,
      colorCompletions,
      staticCompletions,
      dynamicCompletions,
    };
  } catch (error) {
    console.log(error);
    return { colors: {}, variantCompletions: [], staticCompletions: [], colorCompletions: [], dynamicCompletions: [] };
  }
}
