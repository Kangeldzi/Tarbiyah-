(() => {
  const $ = id => document.getElementById(id);
  const sidebar = $("sidebar"), scrim = $("sidebarScrim"), menu = $("menuToggle");
  const toast = message => { const node=$("dashboardToast"); node.textContent=message; node.classList.add("show"); setTimeout(()=>node.classList.remove("show"),2600); };
  const closeMenu = () => { sidebar.classList.remove("open"); scrim.classList.remove("show"); menu.setAttribute("aria-expanded","false"); };
  menu.addEventListener("click",()=>{const open=!sidebar.classList.contains("open");sidebar.classList.toggle("open",open);scrim.classList.toggle("show",open);menu.setAttribute("aria-expanded",String(open));});
  scrim.addEventListener("click",closeMenu);
  document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(item=>item.classList.toggle("active",item===link));closeMenu();}));
  const now=new Date(); $("todayLabel").textContent=new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now); $("footerYear").textContent=now.getFullYear();
  const setUser = user => {
    const metadata=user.user_metadata||{}; const name=metadata.full_name||metadata.display_name||user.email?.split("@")[0]||"Sahabat";
    $("greetingName").textContent=name.split(/\s+/)[0]; $("userName").textContent=name; $("profileButton").textContent=(name.trim()[0]||"T").toUpperCase();
  };
  document.addEventListener("tarbiyah:session-ready",event=>setUser(event.detail.user),{once:true});
  if(window.TARBIYAH_SESSION?.user)setUser(window.TARBIYAH_SESSION.user);
  $("themeToggle").addEventListener("click",()=>{const current=window.TARBIYAH_THEME?.get?.()||"system";const next=current==="system"?"light":current==="light"?"dark":"system";window.TARBIYAH_THEME?.set(next);toast(`Tema ${next==="system"?"mengikuti perangkat":next} diaktifkan.`);});
  $("logoutButton").addEventListener("click",async()=>{const button=$("logoutButton");button.disabled=true;button.textContent="Keluar...";try{await window.TARBIYAH_AUTH.signOut();location.replace(window.TARBIYAH_CONFIG?.LOGIN_PAGE||"./login-register.html");}catch(error){button.disabled=false;button.innerHTML="<span>⇥</span> Keluar akun";toast(error.message||"Gagal keluar dari akun.");}});
  $("profileButton").addEventListener("click",()=>toast("Pengaturan profil akan dibuka pada modul profil anggota."));
  // Carousel otomatis dengan kontrol manual dan jeda ketika tab tidak aktif.
  const slides=[...document.querySelectorAll(".hero-slide")],dots=[...document.querySelectorAll("[data-go-slide]")];let active=0,timer=null;
  function showSlide(index){active=(index+slides.length)%slides.length;slides.forEach((slide,i)=>slide.classList.toggle("active",i===active));dots.forEach((dot,i)=>dot.classList.toggle("active",i===active));}
  function restart(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)showSlide(active+1);},6500);}
  dots.forEach(dot=>dot.addEventListener("click",()=>{showSlide(Number(dot.dataset.goSlide));restart();}));$("prevSlide").addEventListener("click",()=>{showSlide(active-1);restart();});$("nextSlide").addEventListener("click",()=>{showSlide(active+1);restart();});restart();
})();
