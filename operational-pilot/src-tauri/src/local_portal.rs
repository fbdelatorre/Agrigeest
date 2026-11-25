pub fn destination(page: &str) -> Result<&'static str, String> {
    match page {
        "mailbox" => Ok("http://127.0.0.1:48724"),
        "invites" => Ok("http://127.0.0.1:48780/convite"),
        _ => Err("Página local recusada.".into()),
    }
}
#[cfg(target_os = "windows")]
pub fn open(page: &str) -> Result<(), String> {
    use std::{ffi::c_void,ptr};
    let approved=destination(page)?;
    let verb:Vec<u16>="open".encode_utf16().chain(Some(0)).collect();
    let url:Vec<u16>=approved.encode_utf16().chain(Some(0)).collect();
    #[link(name="shell32")]
    extern "system" {fn ShellExecuteW(hwnd:*mut c_void,operation:*const u16,file:*const u16,parameters:*const u16,directory:*const u16,show:i32)->*mut c_void;}
    #[link(name="ole32")]
    extern "system" {fn CoInitializeEx(reserved:*mut c_void,flags:u32)->i32;fn CoUninitialize();}
    unsafe {
        if CoInitializeEx(ptr::null_mut(),0x2|0x4)<0{return Err("Não foi possível abrir o navegador. Use Copiar endereço.".into());}
        let result=ShellExecuteW(ptr::null_mut(),verb.as_ptr(),url.as_ptr(),ptr::null(),ptr::null(),1) as isize;
        CoUninitialize();
        if result>32{Ok(())}else{Err("Não foi possível abrir o navegador. Use Copiar endereço.".into())}
    }
}
#[cfg(not(target_os="windows"))]
pub fn open(page:&str)->Result<(),String>{destination(page)?;Err("Use o endereço no navegador.".into())}
#[cfg(test)]mod tests{#[test]fn accepts_only_named_local_pages(){assert_eq!(super::destination("mailbox").unwrap(),"http://127.0.0.1:48724");assert_eq!(super::destination("invites").unwrap(),"http://127.0.0.1:48780/convite");for bad in ["","http://127.0.0.1:48724","https://outside.test","file:///C:/Windows/system32/cmd.exe","mailbox&whoami","invites\0"]{assert!(super::destination(bad).is_err());}}}
