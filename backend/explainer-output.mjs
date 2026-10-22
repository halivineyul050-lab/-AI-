import {validateScene} from '../public/explain-scene.mjs';
export function parseExplainerOutput(content){
 const json=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');let raw;
 try{raw=JSON.parse(json);}catch(error){const issue=Error('Invalid model JSON');issue.code='json_syntax';issue.path=`character[${Number(/position (\d+)/.exec(error.message)?.[1]??json.length)}]`;throw issue;}
 return validateScene(raw);
}
export function outputIssue(error){
 if(['json_syntax','scene_size','scene_tone','scene_text','scene_variables','scene_controls','scene_parts','scene_steps','scene_expression','invalid_scene'].includes(error?.code)&&/^[a-zA-Z0-9_.\[\]]{1,160}$/.test(error.path))return {code:error.code,path:error.path};
 return {code:'invalid_scene',path:'scene'};
}
export function repairHint(error){const issue=outputIssue(error);return `校验错误 ${issue.code}，位置 ${issue.path}。重新输出完整合法JSON，顶层必须包含字符串title/summary/reason/try/assumptions。variables必须是对象如{"x":0}，绝不是数组；controls使用label，不是name。所有键和字符串使用双引号，不要尾逗号，不要直接写1+2、1/3、Math或代码；计算只能使用规定数组AST。保留4至8个核心部件、1至3个滑块、3至4个步骤，准确解释原问题，保留version:2及全部必需字段。部件ID使用英文字母开头的字母数字下划线且唯一，步骤只引用存在的部件和滑块。size为3个正数字，tone只用lo/mid/hi/lit。scale范围0.1至3；profile轮廓outline用3至32个范围[-0.5,0.5]的二维数字点，不能是字符串。不要思考过程或Markdown。`;}
