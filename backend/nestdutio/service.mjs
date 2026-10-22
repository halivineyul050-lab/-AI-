import {createHash} from 'node:crypto';
import {createWechatRelease} from './wechat-release.mjs';
import {validateNativeArtifact} from './native-artifact.mjs';
import {validateGeneratedFile} from './generation-manifest.mjs';
import {createDomains} from './domains.mjs';
import {createForms} from './forms.mjs';
import {createPublications,startPublicationServer} from './publications.mjs';
import {createProjects} from './projects.mjs';import {createConfig} from './config.mjs';import {createGenerator} from './generator.mjs';import {createJobs} from './jobs.mjs';import {startPreviewServer} from './preview.mjs';import {checkArtifact} from './checker.mjs';
export function createNestdutio({db,box,assistant,billing,parentOrigin,production=false,options={}}){
 const projects=createProjects(db),config=createConfig(db,box,assistant),forms=createForms(db,projects);let previewPromise,hostingPromise;
 const workerKey=options.nestdutioWorkerKey??process.env.NIKAI_NESTDUTIO_DOMAIN_WORKER_KEY??'';
 const domains=createDomains(db,projects,{workerReady:/^[a-f0-9]{64}$/.test(workerKey),dns:options.nestdutioDomainDns,health:options.nestdutioDomainHealth});
 const publishOrigin=options.nestdutioPublishOrigin??process.env.NIKAI_NESTDUTIO_PUBLISH_ORIGIN;
 const publications=publishOrigin?createPublications(db,projects,{originTemplate:publishOrigin,health:options.nestdutioHealth,resolveDomain:host=>domains.resolve(host)}):null;
 const startHosting=()=>{if(!publications)return Promise.resolve();if(!hostingPromise)hostingPromise=startPublicationServer(publications,{forms,port:Number(options.nestdutioPublishPort??process.env.NIKAI_NESTDUTIO_PUBLISH_PORT??0)}).catch(e=>{hostingPromise=null;throw e;});return hostingPromise;};
 const configuredOrigin=options.nestdutioPreviewOrigin??process.env.NIKAI_NESTDUTIO_PREVIEW_ORIGIN;
 const previewReady=!!parentOrigin&&(!production||!!configuredOrigin);
 const preview=()=>{if(!previewReady)throw Object.assign(Error('独立预览域名尚未配置'),{status:503,code:'nestdutio_preview_unavailable'});if(!previewPromise)previewPromise=startPreviewServer({parentOrigin,originTemplate:configuredOrigin,port:Number(options.nestdutioPreviewPort??process.env.NIKAI_NESTDUTIO_PREVIEW_PORT??0)}).catch(e=>{previewPromise=null;throw e;});return previewPromise;};
 const checker=options.nestdutioChecker??{async check(artifact,{deadline,onProgress,quality}){if(artifact.target==='wechat'){try{validateNativeArtifact(artifact);for(const file of artifact.files)validateGeneratedFile(file,'wechat');return {ok:true,issues:[],verification:{structure:'passed',compile:'pending',business:'pending'}};}catch{return {ok:false,issues:[{code:'native_structure_failed',path:'native'}]};}}return checkArtifact(artifact,{preview:await preview(),deadline,onProgress,quality});}};
 const generator=createGenerator(config,checker,{fetchImpl:options.nestdutioFetch,lookup:options.nestdutioLookup});
 const metering=()=>{const c=config.config(),revision=createHash('sha256').update(JSON.stringify([c.billing,c.model,c.endpoint,billing.config().modelPrices.nestdutio??billing.config().defaultImageCredits])).digest('hex');return {billing:c.billing,revision,model:c.model,endpoint:c.endpoint};};
 const jobs=createJobs(db,projects,generator,billing,{metering,generationConfig:()=>config.config(),ready:target=>config.config().ready&&(target==='wechat'||previewReady)});
 const wechat=createWechatRelease(db,projects);
 const taskPreviews=new Map();
 async function taskPreview(user,id){
  const draft=jobs.previewArtifact(user,id);if(!draft)return null;
  const server=await preview();
  for(const [key,entry]of taskPreviews)if(entry.expiresAt<=Date.now()){server.revoke(entry.id);taskPreviews.delete(key);}
  const previous=taskPreviews.get(id);
  if(previous?.revision===draft.revision)return previous;
  if(previous){server.revoke(previous.id);taskPreviews.delete(id);}
  if(taskPreviews.size>=30){const [key,entry]=taskPreviews.entries().next().value;server.revoke(entry.id);taskPreviews.delete(key);}
  const result={...server.put(draft.artifact,{project:draft.projectId}),revision:draft.revision,partial:true};
  taskPreviews.set(id,result);return result;
 }
 return {projects,forms,domains,workerKey,config,jobs,wechat,preview,taskPreview,publications,startHosting,publicConfig(){const c=config.config(),credit=billing.config();return {billing:c.billing,billingRevision:metering().revision,maxTokens:c.maxTokens,enabled:c.enabled,ready:c.ready&&previewReady,modelReady:c.ready,previewReady,unitCredits:credit.modelPrices.nestdutio??credit.defaultImageCredits,capabilities:['static','localStorage','forms'],targets:['web','wechat'],targetReadiness:{web:c.ready&&previewReady,wechat:c.ready},customDomainsEnabled:/^[a-f0-9]{64}$/.test(workerKey),publishingEnabled:!!publications,publishOrigin:publishOrigin??null};},assertUser:user=>assistant.assertUser(user),async close(){await jobs.shutdown();if(hostingPromise)await(await hostingPromise).close();if(previewPromise)await(await previewPromise).close();}};
}
