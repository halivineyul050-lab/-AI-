export const nativeFixture=()=>({schemaVersion:1,target:'wechat',entry:'app.json',name:'原生计数器',capabilities:['storage'],acceptance:[{kind:'tap',target:'#add',output:'#count',value:'1'}],files:[
 {path:'app.json',content:'{"pages":["pages/index/index"]}'},{path:'app.js',content:'App({})'},{path:'app.wxss',content:'page { background:#fafafa; }'},{path:'project.config.json',content:'{}'},
 {path:'pages/index/index.json',content:'{}'},{path:'pages/index/index.js',content:'Page({data:{count:0},add(){this.setData({count:this.data.count+1})}})'},{path:'pages/index/index.wxml',content:'<view id="count">{{count}}</view><button id="add" bindtap="add">增加</button>'},{path:'pages/index/index.wxss',content:'view { padding:24rpx; }'}
]});
