import{C as i}from"./const.50b78ad9.js";import"./hoisted.d5dad64d.js";const e=document.querySelector("form"),t=e?.querySelector("button"),n=()=>{t&&(t.innerHTML="Enviar",t.disabled=!1)};e?.addEventListener("submit",async o=>{o.preventDefault();const a=new FormData(e),r=Object.fromEntries(a.entries());if(t&&(t.innerHTML="Enviando...",t.disabled=!0),!r.name||!r.email){alert("Por favor, ingrese su nombre y correo electrónico"),n();return}const s=await(await fetch(`/api/send-email?category=${i.REQUEST_CONTACT}`,{method:e.method,body:new FormData(e)})).json();n(),e?.reset(),alert(s.message)});
