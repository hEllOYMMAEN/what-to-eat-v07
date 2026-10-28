export type Category = '한식'|'일식'|'중식'|'양식'|'분식'|'패스트푸드'|'아시안'|'가벼운 식사';
export type Meal = {id:number;name:string;category:Category;emoji:string;price:number;spice:0|1|2|3;portion:'가볍게'|'든든하게';keywords:string[]};
