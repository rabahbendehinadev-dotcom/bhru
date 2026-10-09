import {parseUsd} from '../commerce/currency-money';
import {HttpError} from '../auth';
/** Legacy name parseUsd denotes the common exact 10^12 decimal scale only. */
export function fundingUnits(value:string){
  try{return parseUsd(value);}catch{throw new HttpError(400,'Enter a valid decimal amount within the safe monetary limit.');}
}
